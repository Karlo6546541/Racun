import type { User } from "@prisma/client";
import { prisma } from "./db";
import { freeDailyMinutes } from "./config";
import { ipHash } from "./codes";
import { beatCredit, limitSeconds, usageStatus, type UsageStatus } from "@/lib/game/usage";
import { isPremium } from "@/lib/game/entitlement";
import { dayKey } from "@/lib/time";

export async function viewerIsPremium(user: User): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
  return isPremium(sub, user.premiumUntil);
}

/** Subjects whose usage counts: the account, plus the IP for guests (so new guest cookies do not reset the limit). */
function subjects(user: User, ip: string | null): string[] {
  const s = ["u:" + user.id];
  if (user.isGuest && ip) s.push("ip:" + ipHash(ip));
  return s;
}

export async function getUsage(user: User, ip: string | null): Promise<UsageStatus> {
  const premium = await viewerIsPremium(user);
  const day = dayKey(new Date(), user.timezone);
  const rows = await prisma.dailyUsage.findMany({ where: { day, subject: { in: subjects(user, ip) } } });
  const used = rows.reduce((m, r) => Math.max(m, r.seconds), 0);
  return usageStatus(premium, used, limitSeconds(await freeDailyMinutes()));
}

/** Credits active learning time. Idempotent per wall-clock: concurrent tabs share lastBeatAt. */
export async function heartbeat(user: User, ip: string | null, now = new Date()): Promise<UsageStatus> {
  const day = dayKey(now, user.timezone);
  for (const subject of subjects(user, ip)) {
    await prisma.$transaction(async (tx) => {
      const row = await tx.dailyUsage.upsert({ where: { subject_day: { subject, day } }, create: { subject, day, seconds: 0 }, update: {} });
      const locked = await tx.$queryRaw<{ seconds: number; lastBeatAt: Date | null }[]>`SELECT seconds, "lastBeatAt" FROM "DailyUsage" WHERE id = ${row.id} FOR UPDATE`;
      const credit = beatCredit(locked[0]?.lastBeatAt ?? null, now);
      await tx.dailyUsage.update({ where: { id: row.id }, data: { seconds: { increment: credit }, lastBeatAt: now } });
    });
  }
  return getUsage(user, ip);
}

export function serializeUsage(u: UsageStatus) {
  return { premium: u.premium, usedSeconds: u.usedSeconds, limitSeconds: u.limitSeconds, remainingSeconds: u.premium ? null : u.remainingSeconds, blocked: u.blocked };
}
