/** Server-side learning-time accounting. */
export const BEAT_INTERVAL_S = 15;
export const MAX_BEAT_CREDIT_S = 20;
/** How far past the limit an in-flight exercise may still be answered (soft landing). */
export const SOFT_LANDING_S = 90;

/**
 * Seconds to credit for a heartbeat. Uses the per-subject lastBeatAt, so parallel tabs
 * never add up to more than wall-clock time, and a gap is capped.
 */
export function beatCredit(lastBeatAt: Date | null, now: Date): number {
  if (!lastBeatAt) return BEAT_INTERVAL_S;
  const s = Math.floor((now.getTime() - lastBeatAt.getTime()) / 1000);
  return Math.max(0, Math.min(MAX_BEAT_CREDIT_S, s));
}

export function limitSeconds(freeMinutes: number): number {
  return Math.max(0, Math.round(freeMinutes * 60));
}

export type UsageStatus = { premium: boolean; usedSeconds: number; limitSeconds: number; remainingSeconds: number; blocked: boolean };

export function usageStatus(premium: boolean, usedSeconds: number, limit: number): UsageStatus {
  if (premium) return { premium, usedSeconds, limitSeconds: limit, remainingSeconds: Infinity, blocked: false };
  const remaining = Math.max(0, limit - usedSeconds);
  return { premium, usedSeconds, limitSeconds: limit, remainingSeconds: remaining, blocked: remaining <= 0 };
}

/** May an answer still be graded? Allows finishing the exercise that was on screen when time ran out. */
export function canAnswer(premium: boolean, usedSeconds: number, limit: number): boolean {
  return premium || usedSeconds <= limit + SOFT_LANDING_S;
}
