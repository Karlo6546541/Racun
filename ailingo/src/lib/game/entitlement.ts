export const GRACE_DAYS = 3;

export type SubLike = { status: string; pastDueSince: Date | null; currentPeriodEnd: Date | null } | null;

/** Premium comes only from a webhook-synced subscription or a manual admin grant. */
export function isPremium(sub: SubLike, premiumUntil: Date | null, now: Date = new Date()): boolean {
  if (premiumUntil && premiumUntil > now) return true;
  if (!sub) return false;
  if (sub.status === "active" || sub.status === "trialing") return true;
  if (sub.status === "past_due" && sub.pastDueSince) return now.getTime() - sub.pastDueSince.getTime() < GRACE_DAYS * 864e5;
  return false;
}
