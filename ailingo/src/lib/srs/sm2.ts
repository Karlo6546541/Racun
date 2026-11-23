export type ReviewState = { ease: number; intervalDays: number; repetitions: number; lapses: number; dueAt: Date };

/** SM-2. quality 0..5; below 3 is a lapse. */
export function sm2(s: ReviewState, quality: number, now: Date = new Date()): ReviewState {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let { ease, intervalDays, repetitions, lapses } = s;
  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;
    lapses += 1;
  } else {
    repetitions += 1;
    intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(intervalDays * ease);
  }
  ease = Math.max(1.3, ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return { ease, intervalDays, repetitions, lapses, dueAt: new Date(now.getTime() + intervalDays * 864e5) };
}

/** Quality from the outcome of an answer. */
export function qualityFor(correct: boolean, firstTry: boolean): number {
  return correct ? (firstTry ? 4 : 3) : 2;
}
