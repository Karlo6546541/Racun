import { daysBetween } from "../time";

export type StreakState = { current: number; longest: number; lastActiveDay: string | null };

/** Applies activity on `today`. A Streak Freeze covers exactly one missed day. */
export function touchStreak(s: StreakState, today: string, freezes: number): { streak: StreakState; freezes: number; usedFreeze: boolean } {
  if (s.lastActiveDay === today) return { streak: s, freezes, usedFreeze: false };
  let current = 1;
  let usedFreeze = false;
  if (s.lastActiveDay) {
    const gap = daysBetween(s.lastActiveDay, today);
    if (gap === 1) current = s.current + 1;
    else if (gap === 2 && freezes > 0) {
      current = s.current + 1;
      freezes -= 1;
      usedFreeze = true;
    }
  }
  return { streak: { current, longest: Math.max(s.longest, current), lastActiveDay: today }, freezes, usedFreeze };
}

/** The streak a user sees today (0 if it is already broken). */
export function visibleStreak(s: StreakState, today: string, freezes: number): number {
  if (!s.lastActiveDay) return 0;
  const gap = daysBetween(s.lastActiveDay, today);
  return gap <= 1 || (gap === 2 && freezes > 0) ? s.current : 0;
}
