import { assertCron } from "@/server/cron";
import { settleAll } from "@/server/leagues";
import { jsonError } from "@/server/errors";

/** Settles finished league weeks (promotion and demotion). Idempotent. */
export async function GET(req: Request) {
  try {
    assertCron(req);
    return Response.json({ settledUsers: await settleAll() });
  } catch (e) {
    return jsonError(e);
  }
}
