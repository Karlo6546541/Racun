export const DEFAULT_TZ = "Europe/Zagreb";

function parts(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return { y: o.year, m: o.month, d: o.day, h: +o.hour, min: +o.minute, s: +o.second };
}

/** Local calendar day "YYYY-MM-DD" in the given time zone. */
export function dayKey(d: Date = new Date(), tz = DEFAULT_TZ): string {
  const p = parts(d, tz);
  return `${p.y}-${p.m}-${p.d}`;
}

export function addDays(key: string, n: number): string {
  const t = new Date(key + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
}

/** Monday of the local week, as a day key. */
export function weekKey(d: Date = new Date(), tz = DEFAULT_TZ): string {
  const k = dayKey(d, tz);
  const wd = (new Date(k + "T00:00:00Z").getUTCDay() + 6) % 7;
  return addDays(k, -wd);
}

/** Seconds until the next local midnight. */
export function secondsToMidnight(d: Date = new Date(), tz = DEFAULT_TZ): number {
  const p = parts(d, tz);
  return Math.max(1, 86400 - (p.h * 3600 + p.min * 60 + p.s));
}

/** Fraction (0..1) of the local week that has passed. */
export function weekFraction(d: Date = new Date(), tz = DEFAULT_TZ): number {
  const p = parts(d, tz);
  const k = `${p.y}-${p.m}-${p.d}`;
  const wd = (new Date(k + "T00:00:00Z").getUTCDay() + 6) % 7;
  return Math.min(1, (wd + (p.h * 3600 + p.min * 60 + p.s) / 86400) / 7);
}
