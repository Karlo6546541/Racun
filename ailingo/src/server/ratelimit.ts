import { prisma } from "./db";
import { AppError } from "./errors";

/** Fixed-window limiter stored in Postgres, so it works across serverless instances. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSec * 1000);
  const row = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" (key, count, "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "RateLimit"."resetAt" < ${now} THEN 1 ELSE "RateLimit".count + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN ${resetAt} ELSE "RateLimit"."resetAt" END
    RETURNING count`;
  if ((row[0]?.count ?? 0) > limit) throw new AppError("RATE_LIMITED", "Too many requests, try again shortly.");
}

export function clientIp(h: Headers): string {
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
}
