import type { Prisma, User } from "@prisma/client";
import { prisma } from "./db";
import { META } from "@/lib/content/meta";
import { botXp, LEAGUE_SIZE, pickBots, rank, tierChange, type Row } from "@/lib/game/leagues";
import { weekFraction, weekKey } from "@/lib/time";

type Tx = Prisma.TransactionClient;
const maxTier = () => META.tiers.length - 1;

/** Settles finished weeks for one user: rank in that league, then promote or demote. */
export async function settleUser(userId: string, db: Tx | typeof prisma = prisma) {
  const current = weekKey();
  const open = await db.leagueMembership.findMany({ where: { userId, settled: false, league: { weekKey: { lt: current } } }, include: { league: { include: { members: true } } } });
  for (const m of open) {
    const rows = leagueRows(m.league.members, m.league.weekKey, m.league.tier, 1, userId);
    const pos = rows.findIndex((r) => r.isMe) + 1;
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) continue;
    const delta = tierChange(pos, m.weeklyXp, m.league.tier, maxTier());
    await db.leagueMembership.update({ where: { id: m.id }, data: { settled: true, finalRank: pos } });
    await db.user.update({ where: { id: userId }, data: { leagueTier: Math.max(0, Math.min(maxTier(), m.league.tier + delta)) } });
  }
}

/** Puts the user into a league for the current week (replacing a bot), creating one if needed. */
export async function ensureMembership(user: User, db: Tx | typeof prisma = prisma) {
  const wk = weekKey();
  const existing = await db.leagueMembership.findFirst({ where: { userId: user.id, league: { weekKey: wk } } });
  if (existing) return existing;
  await settleUser(user.id, db);
  const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  const tier = fresh.leagueTier;
  const candidates = await db.league.findMany({ where: { tier, weekKey: wk }, include: { members: { select: { id: true, userId: true } } } });
  const league = candidates.find((l) => l.members.some((m) => !m.userId));
  if (league) {
    const bot = league.members.find((m) => !m.userId)!;
    await db.leagueMembership.delete({ where: { id: bot.id } });
    return db.leagueMembership.create({ data: { leagueId: league.id, userId: user.id } });
  }
  const bots = pickBots(META.bots, wk + ":" + candidates.length, tier, LEAGUE_SIZE - 1);
  return db.league.create({
    data: {
      tier,
      weekKey: wk,
      members: { create: [{ userId: user.id }, ...bots.map((name, i) => ({ botName: name, botAvatar: META.avatars[i % META.avatars.length] }))] },
    },
  }).then(async (l) => db.leagueMembership.findFirstOrThrow({ where: { leagueId: l.id, userId: user.id } }));
}

type MemberLike = { id: string; userId: string | null; botName: string | null; botAvatar: string | null; weeklyXp: number };

export function leagueRows(members: (MemberLike & { user?: { name: string | null; isGuest: boolean; hideFromLeaderboards: boolean } | null })[], wk: string, tier: number, fraction: number, meId: string): Row[] {
  return rank(
    members.map((m) =>
      m.userId
        ? { id: m.id, name: m.user ? (m.user.hideFromLeaderboards ? "—" : m.user.name || (m.user.isGuest ? "Gost" : "AIlingo")) : "", xp: m.weeklyXp, isBot: false, avatar: "🤖", isMe: m.userId === meId }
        : { id: m.id, name: m.botName || "Bot", xp: botXp(m.botName || "", wk, tier, fraction), isBot: true, avatar: m.botAvatar || "🦉" },
    ),
  );
}

export async function myLeague(user: User) {
  await ensureMembership(user);
  const wk = weekKey();
  const m = await prisma.leagueMembership.findFirstOrThrow({
    where: { userId: user.id, league: { weekKey: wk } },
    include: { league: { include: { members: { include: { user: { select: { name: true, isGuest: true, hideFromLeaderboards: true } } } } } } },
  });
  const rows = leagueRows(m.league.members, wk, m.league.tier, weekFraction(), user.id);
  const last = await prisma.leagueMembership.findFirst({ where: { userId: user.id, settled: true }, orderBy: { league: { weekKey: "desc" } }, include: { league: true } });
  return { tier: m.league.tier, weekKey: wk, rows, last: last ? { rank: last.finalRank ?? 0, tier: last.league.tier, weekKey: last.league.weekKey } : null };
}

/** Weekly cron: settles every finished week for every real member. Safe to run repeatedly. */
export async function settleAll() {
  const open = await prisma.leagueMembership.findMany({ where: { settled: false, userId: { not: null }, league: { weekKey: { lt: weekKey() } } }, select: { userId: true }, distinct: ["userId"] });
  for (const m of open) await settleUser(m.userId!);
  return open.length;
}
