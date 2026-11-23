import type { Prisma, User, XPSource } from "@prisma/client";
import { prisma } from "./db";
import { META } from "@/lib/content/meta";
import { touchStreak } from "@/lib/game/streak";
import { DAILY_XP_CAP } from "@/lib/game/xp";
import { questStep } from "@/lib/game/quests";
import { earnedBadges, readStats, type Stats } from "@/lib/game/stats";
import { dayKey, weekKey } from "@/lib/time";
import { ensureMembership } from "./leagues";
import { getContent, trackLessons } from "./content";

type Tx = Prisma.TransactionClient;

/** The only place XP is ever granted. Server-side, capped per day, mirrored into the weekly league. */
export async function awardXp(tx: Tx, user: User, amount: number, source: XPSource, refId?: string): Promise<{ granted: number; usedFreeze: boolean }> {
  if (amount <= 0) return { granted: 0, usedFreeze: false };
  const day = dayKey(new Date(), user.timezone);
  const today = await tx.xPEvent.aggregate({ where: { userId: user.id, dayKey: day }, _sum: { amount: true } });
  const room = Math.max(0, DAILY_XP_CAP - (today._sum.amount ?? 0));
  const granted = Math.min(room, amount);
  if (granted < amount) await tx.user.update({ where: { id: user.id }, data: { flagged: true, flagReason: "daily XP cap reached" } });
  if (granted <= 0) return { granted: 0, usedFreeze: false };
  await tx.xPEvent.create({ data: { userId: user.id, amount: granted, source, refId, weekKey: weekKey(), dayKey: day } });
  const fresh = await tx.user.update({ where: { id: user.id }, data: { xpTotal: { increment: granted } } });
  const s = await tx.streak.findUnique({ where: { userId: user.id } });
  const r = touchStreak({ current: s?.current ?? 0, longest: s?.longest ?? 0, lastActiveDay: s?.lastActiveDay ?? null }, day, fresh.streakFreezes);
  if (r.streak.lastActiveDay !== s?.lastActiveDay) {
    await tx.streak.upsert({ where: { userId: user.id }, create: { userId: user.id, ...r.streak }, update: r.streak });
    if (r.usedFreeze) await tx.user.update({ where: { id: user.id }, data: { streakFreezes: r.freezes } });
  }
  const m = await ensureMembership(fresh, tx);
  await tx.leagueMembership.update({ where: { id: m.id }, data: { weeklyXp: { increment: granted } } });
  return { granted, usedFreeze: r.usedFreeze };
}

export async function ensureQuests(tx: Tx | typeof prisma, user: User) {
  const day = dayKey(new Date(), user.timezone);
  for (const q of META.quests) {
    await tx.dailyQuest.upsert({ where: { userId_day_code: { userId: user.id, day, code: q.id } }, create: { userId: user.id, day, code: q.id, target: q.target, rewardXp: q.reward }, update: {} });
  }
  return tx.dailyQuest.findMany({ where: { userId: user.id, day }, orderBy: { code: "asc" } });
}

/** Advances a quest; grants its reward once. Returns the quest id when it was completed now. */
export async function questEvent(tx: Tx, user: User, code: string, value: number): Promise<string | null> {
  const def = META.quests.find((q) => q.id === code);
  if (!def) return null;
  await ensureQuests(tx, user);
  const day = dayKey(new Date(), user.timezone);
  const q = await tx.dailyQuest.findUniqueOrThrow({ where: { userId_day_code: { userId: user.id, day, code } } });
  const step = questStep(def, q.progress, value);
  if (!step) return null;
  await tx.dailyQuest.update({ where: { id: q.id }, data: { progress: step.progress, completedAt: step.completed ? new Date() : null } });
  if (step.completed) {
    await awardXp(tx, user, def.reward, "QUEST", code);
    await tx.user.update({ where: { id: user.id }, data: { gems: { increment: 3 } } });
    return code;
  }
  return null;
}

export async function bumpStats(tx: Tx, userId: string, f: (s: Stats) => Stats) {
  const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { stats: true } });
  await tx.user.update({ where: { id: userId }, data: { stats: f(readStats(u.stats)) } });
}

/** Grants any badge whose rule is now met. Returns new badge ids. */
export async function checkBadges(tx: Tx | typeof prisma, userId: string): Promise<string[]> {
  const [user, have, streak, friends, done] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: userId } }),
    tx.userBadge.findMany({ where: { userId }, select: { badgeId: true } }),
    tx.streak.findUnique({ where: { userId } }),
    tx.friendship.count({ where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] } }),
    tx.progress.findMany({ where: { userId, done: true }, select: { lessonId: true } }),
  ]);
  const doneSet = new Set(done.map((d) => d.lessonId));
  const { units } = await getContent();
  const fresh = earnedBadges(META.badges, new Set(have.map((h) => h.badgeId)), {
    stats: readStats(user.stats),
    streakBest: streak?.longest ?? 0,
    xpTotal: user.xpTotal,
    friends,
    lessonsDone: doneSet.size,
    unitDone: (id) => {
      const u = units.find((x) => x.id === id);
      return !!u && u.lessons.every((l) => doneSet.has(l.id));
    },
    trackDone: (id) => {
      const list = trackLessons(units, id);
      return list.length > 0 && list.every((x) => doneSet.has(x.lesson.id));
    },
  });
  for (const id of fresh) {
    await tx.userBadge.create({ data: { userId, badgeId: id } });
    await tx.user.update({ where: { id: userId }, data: { gems: { increment: 5 } } });
  }
  return fresh;
}
