import { prisma } from "./db";

const DEFAULTS: Record<string, string> = {
  FREE_DAILY_MINUTES: process.env.FREE_DAILY_MINUTES || "10",
  PRICE_MONTHLY_LABEL: "6,99 €",
  PRICE_YEARLY_LABEL: "49,99 €",
};
export const CONFIG_KEYS = Object.keys(DEFAULTS);

let cache: { at: number; map: Record<string, string> } | null = null;

export async function getConfig(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < 30_000) return cache.map;
  const rows = await prisma.appConfig.findMany();
  const map = { ...DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  cache = { at: Date.now(), map };
  return map;
}

export async function setConfig(key: string, value: string) {
  await prisma.appConfig.upsert({ where: { key }, create: { key, value }, update: { value } });
  cache = null;
}

export async function freeDailyMinutes(): Promise<number> {
  const v = Number((await getConfig()).FREE_DAILY_MINUTES);
  return Number.isFinite(v) && v >= 0 ? v : 10;
}

export function hmacSecret(): string {
  const s = process.env.SESSION_HMAC_SECRET || process.env.AUTH_SECRET;
  if (!s) throw new Error("SESSION_HMAC_SECRET (or AUTH_SECRET) must be set");
  return s;
}
