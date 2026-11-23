export type Stats = {
  answered: number;
  correct: number;
  perfect: number;
  comboBest: number;
  halluc: number;
  promptsDone: number;
  rubricPass: number;
  practiceSessions: number;
};

export const EMPTY_STATS: Stats = { answered: 0, correct: 0, perfect: 0, comboBest: 0, halluc: 0, promptsDone: 0, rubricPass: 0, practiceSessions: 0 };

export function readStats(json: unknown): Stats {
  const o = (json && typeof json === "object" ? json : {}) as Partial<Stats>;
  const out = { ...EMPTY_STATS };
  for (const k of Object.keys(EMPTY_STATS) as (keyof Stats)[]) if (typeof o[k] === "number") out[k] = o[k]!;
  return out;
}

export type BadgeRule = { stat: string; gte: number };
export type BadgeCtx = { stats: Stats; streakBest: number; xpTotal: number; friends: number; lessonsDone: number; unitDone: (id: string) => boolean; trackDone: (id: string) => boolean };

export function statValue(stat: string, c: BadgeCtx): number {
  if (stat.startsWith("unit:")) return c.unitDone(stat.slice(5)) ? 1 : 0;
  if (stat.startsWith("track:")) return c.trackDone(stat.slice(6)) ? 1 : 0;
  switch (stat) {
    case "streakBest":
      return c.streakBest;
    case "xpTotal":
      return c.xpTotal;
    case "friends":
      return c.friends;
    case "lessonsDone":
      return c.lessonsDone;
    default:
      return (c.stats as Record<string, number>)[stat] ?? 0;
  }
}

export function earnedBadges(rules: { id: string; rule: BadgeRule }[], have: Set<string>, c: BadgeCtx): string[] {
  return rules.filter((b) => !have.has(b.id) && statValue(b.rule.stat, c) >= b.rule.gte).map((b) => b.id);
}
