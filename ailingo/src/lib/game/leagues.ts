export const LEAGUE_SIZE = 30;
export const PROMOTE_TOP = 10;
export const DEMOTE_BOTTOM = 5;

export function seeded(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic bot XP: grows through the week toward a seeded target. */
export function botXp(name: string, weekKey: string, tier: number, weekFraction: number): number {
  const r = seeded(name + weekKey + tier);
  const target = 60 + Math.floor(r() * (650 + tier * 150));
  const pace = 0.75 + r() * 0.5;
  return Math.round(target * Math.min(1, weekFraction * pace));
}

export function pickBots(names: string[], weekKey: string, tier: number, count: number): string[] {
  const r = seeded("lg" + weekKey + tier);
  const a = names.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, count);
}

export type Row = { id: string; name: string; xp: number; isBot: boolean; avatar: string; isMe?: boolean };

export function rank(rows: Row[]): Row[] {
  return rows.slice().sort((a, b) => b.xp - a.xp || Number(a.isBot) - Number(b.isBot) || a.name.localeCompare(b.name));
}

/** Tier change after a finished week. Users with no XP stay put. */
export function tierChange(rankPos: number, weeklyXp: number, tier: number, maxTier: number, size = LEAGUE_SIZE): number {
  if (weeklyXp <= 0) return 0;
  if (rankPos <= PROMOTE_TOP && tier < maxTier) return 1;
  if (rankPos > size - DEMOTE_BOTTOM && tier > 0) return -1;
  return 0;
}
