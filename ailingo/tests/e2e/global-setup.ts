import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/**
 * Non-destructive setup: applies migrations and seeds content, then removes only data created by
 * previous E2E runs (guests and @ailingo.test accounts). Refuses to touch a database not named *_test.
 */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL || "postgresql://ailingo:ailingo@localhost:5432/ailingo_test";
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith("_test")) throw new Error(`E2E refuses to run against "${dbName}": the database name must end with _test`);
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "inherit" });
  const db = new PrismaClient({ datasources: { db: { url } } });
  await db.user.deleteMany({ where: { OR: [{ isGuest: true }, { email: { endsWith: "@ailingo.test" } }] } });
  await db.league.deleteMany({ where: { members: { none: { userId: { not: null } } } } });
  await db.dailyUsage.deleteMany({});
  await db.rateLimit.deleteMany({});
  await db.stripeEvent.deleteMany({ where: { id: { startsWith: "evt_e2e" } } });
  await db.$disconnect();
}
