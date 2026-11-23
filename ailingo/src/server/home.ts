import type { User } from "@prisma/client";
import { prisma } from "./db";
import { getUsage, serializeUsage, viewerIsPremium } from "./usage";
import { tickHearts } from "@/lib/game/hearts";
import { visibleStreak } from "@/lib/game/streak";
import { levelFor } from "@/lib/game/xp";
import { dayKey } from "@/lib/time";

/** Data for the stat bar, plus the monthly Premium perk (2 Streak Freezes). */
export async function homeData(user0: User, ip: string | null) {
  let user = user0;
  const h = tickHearts({ hearts: user.hearts, refillAt: user.heartsRefillAt });
  if (h.hearts !== user.hearts) user = await prisma.user.update({ where: { id: user.id }, data: { hearts: h.hearts, heartsRefillAt: h.refillAt } });
  const month = dayKey(new Date(), user.timezone).slice(0, 7);
  if (user.freezeGrantMonth !== month && (await viewerIsPremium(user))) user = await prisma.user.update({ where: { id: user.id }, data: { freezeGrantMonth: month, streakFreezes: Math.max(user.streakFreezes, 2) } });
  const streak = await prisma.streak.findUnique({ where: { userId: user.id } });
  const today = dayKey(new Date(), user.timezone);
  const usage = serializeUsage(await getUsage(user, ip));
  return {
    user,
    streak: visibleStreak({ current: streak?.current ?? 0, longest: streak?.longest ?? 0, lastActiveDay: streak?.lastActiveDay ?? null }, today, user.streakFreezes),
    bestStreak: streak?.longest ?? 0,
    hearts: h.hearts,
    level: levelFor(user.xpTotal),
    usage,
  };
}
