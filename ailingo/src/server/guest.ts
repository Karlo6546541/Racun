import { prisma } from "./db";
import { readStats } from "@/lib/game/stats";

export const GUEST_COOKIE = "ailingo_guest";

/**
 * Moves everything a guest earned into a real account, then deletes the guest.
 * Records are re-assigned, never copied, so XP cannot be counted twice.
 */
export async function mergeGuestInto(guestId: string, userId: string) {
  const [guest, user] = await Promise.all([prisma.user.findUnique({ where: { id: guestId }, include: { streak: true } }), prisma.user.findUnique({ where: { id: userId }, include: { streak: true } })]);
  if (!guest || !user || !guest.isGuest) return;

  await prisma.$transaction(async (tx) => {
    await tx.xPEvent.updateMany({ where: { userId: guestId }, data: { userId } });
    await tx.attempt.updateMany({ where: { userId: guestId }, data: { userId } });
    await tx.playSession.updateMany({ where: { userId: guestId }, data: { userId } });

    for (const p of await tx.progress.findMany({ where: { userId: guestId } })) {
      const mine = await tx.progress.findUnique({ where: { userId_lessonId: { userId, lessonId: p.lessonId } } });
      if (!mine) await tx.progress.update({ where: { id: p.id }, data: { userId } });
      else
        await tx.progress.update({
          where: { id: mine.id },
          data: { done: mine.done || p.done, stars: Math.max(mine.stars, p.stars), runs: mine.runs + p.runs, bestAccuracy: Math.max(mine.bestAccuracy, p.bestAccuracy), completedAt: mine.completedAt ?? p.completedAt },
        });
    }
    for (const r of await tx.reviewItem.findMany({ where: { userId: guestId } })) {
      const mine = await tx.reviewItem.findUnique({ where: { userId_exerciseId: { userId, exerciseId: r.exerciseId } } });
      if (!mine) await tx.reviewItem.update({ where: { id: r.id }, data: { userId } });
    }
    for (const b of await tx.userBadge.findMany({ where: { userId: guestId } })) {
      await tx.userBadge.upsert({ where: { userId_badgeId: { userId, badgeId: b.badgeId } }, create: { userId, badgeId: b.badgeId, earnedAt: b.earnedAt }, update: {} });
    }
    for (const m of await tx.leagueMembership.findMany({ where: { userId: guestId } })) {
      const mine = await tx.leagueMembership.findFirst({ where: { userId, league: { weekKey: (await tx.league.findUnique({ where: { id: m.leagueId } }))!.weekKey } } });
      if (!mine) await tx.leagueMembership.update({ where: { id: m.id }, data: { userId } });
      else await tx.leagueMembership.update({ where: { id: mine.id }, data: { weeklyXp: { increment: m.weeklyXp } } });
    }
    for (const u of await tx.dailyUsage.findMany({ where: { subject: "u:" + guestId } })) {
      await tx.dailyUsage.upsert({ where: { subject_day: { subject: "u:" + userId, day: u.day } }, create: { subject: "u:" + userId, day: u.day, seconds: u.seconds, lastBeatAt: u.lastBeatAt }, update: { seconds: { increment: u.seconds } } });
    }
    if (guest.streak) {
      const s = user.streak;
      const gs = guest.streak;
      const pickGuest = !s || (gs.lastActiveDay ?? "") > (s.lastActiveDay ?? "");
      await tx.streak.upsert({
        where: { userId },
        create: { userId, current: gs.current, longest: gs.longest, lastActiveDay: gs.lastActiveDay },
        update: { current: pickGuest ? gs.current : s!.current, longest: Math.max(gs.longest, s?.longest ?? 0), lastActiveDay: pickGuest ? gs.lastActiveDay : s!.lastActiveDay },
      });
    }
    const a = readStats(user.stats);
    const b = readStats(guest.stats);
    const stats = { ...a };
    for (const k of Object.keys(stats) as (keyof typeof stats)[]) stats[k] = k === "comboBest" ? Math.max(a[k], b[k]) : a[k] + b[k];
    await tx.user.update({
      where: { id: userId },
      data: {
        xpTotal: { increment: guest.xpTotal },
        gems: { increment: guest.gems },
        streakFreezes: Math.min(2, user.streakFreezes + guest.streakFreezes),
        blitzBest: Math.max(user.blitzBest, guest.blitzBest),
        placementDone: user.placementDone || guest.placementDone,
        stats,
        ...(user.onboarded
          ? {}
          : { onboarded: guest.onboarded, goal: guest.goal, level: guest.level, dailyGoalMin: guest.dailyGoalMin, locale: guest.locale, name: user.name ?? guest.name }),
      },
    });
    await tx.user.delete({ where: { id: guestId } });
  });
}
