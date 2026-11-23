import { prisma } from "./db";
import { cancelForDeletion } from "./billing";
import { cancelPlayForDeletion } from "./playbilling";

/** Everything stored about a user, as JSON (GDPR art. 15/20). */
export async function exportUserData(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      accounts: { select: { provider: true, type: true } },
      progress: true,
      attempts: { orderBy: { createdAt: "asc" } },
      xpEvents: { orderBy: { createdAt: "asc" } },
      streak: true,
      quests: true,
      badges: true,
      leagues: { include: { league: { select: { tier: true, weekKey: true } } } },
      reviewItems: true,
      pushSubs: { select: { endpoint: true, createdAt: true } },
      subscription: { select: { status: true, plan: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, trialEnd: true } },
      friendsSent: { select: { addresseeId: true, status: true, createdAt: true } },
      friendsReceived: { select: { requesterId: true, status: true, createdAt: true } },
    },
  });
  const usage = await prisma.dailyUsage.findMany({ where: { subject: "u:" + userId } });
  return { exportedAt: new Date().toISOString(), user, dailyUsage: usage };
}

/** Permanent deletion: cancels the subscription, then removes the user and every related row (cascade). */
export async function deleteAccount(userId: string) {
  await cancelForDeletion(userId);
  await cancelPlayForDeletion(userId);
  await prisma.dailyUsage.deleteMany({ where: { subject: "u:" + userId } });
  await prisma.user.delete({ where: { id: userId } });
}
