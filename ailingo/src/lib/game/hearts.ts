export const MAX_HEARTS = 5;
export const HEART_MS = 30 * 60 * 1000;

export type Hearts = { hearts: number; refillAt: Date | null };

/** Applies time-based refill: one heart every 30 minutes. */
export function tickHearts(h: Hearts, now: Date = new Date()): Hearts {
  if (h.hearts >= MAX_HEARTS) return { hearts: MAX_HEARTS, refillAt: null };
  const start = h.refillAt ?? now;
  const n = Math.floor((now.getTime() - start.getTime()) / HEART_MS);
  if (n <= 0) return { hearts: h.hearts, refillAt: start };
  const hearts = Math.min(MAX_HEARTS, h.hearts + n);
  return { hearts, refillAt: hearts >= MAX_HEARTS ? null : new Date(start.getTime() + n * HEART_MS) };
}

export function loseHeart(h: Hearts, now: Date = new Date()): Hearts {
  const t = tickHearts(h, now);
  return { hearts: Math.max(0, t.hearts - 1), refillAt: t.hearts >= MAX_HEARTS ? now : t.refillAt ?? now };
}

export function gainHeart(h: Hearts, now: Date = new Date()): Hearts {
  const t = tickHearts(h, now);
  const hearts = Math.min(MAX_HEARTS, t.hearts + 1);
  return { hearts, refillAt: hearts >= MAX_HEARTS ? null : t.refillAt };
}
