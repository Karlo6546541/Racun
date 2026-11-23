export const DAILY_GOAL_XP: Record<number, number> = { 5: 50, 10: 100, 15: 150, 20: 200 };
export const DAILY_XP_CAP = 2500;

export function levelStart(n: number): number {
  return 75 * n * (n - 1);
}
export function levelFor(xp: number): number {
  let l = 1;
  while (xp >= levelStart(l + 1)) l++;
  return l;
}

/** XP for one correct answer. */
export function answerXp(opts: { mode: "LESSON" | "PRACTICE" | "PLACEMENT" | "BLITZ"; firstTry: boolean; combo: number; rubricScore?: number }): number {
  if (opts.mode === "PLACEMENT") return 0;
  let xp = opts.mode === "BLITZ" ? 5 : opts.firstTry ? 10 : 5;
  if (opts.rubricScore !== undefined) xp = Math.round(xp * (0.5 + opts.rubricScore / 200));
  if (opts.combo >= 3) xp += 3;
  return xp;
}

export function lessonBonus(perfect: boolean) {
  return { xp: 20 + (perfect ? 10 : 0), gems: perfect ? 8 : 5 };
}

export function starsFor(wrong: number): number {
  return wrong === 0 ? 3 : wrong <= 2 ? 2 : 1;
}
