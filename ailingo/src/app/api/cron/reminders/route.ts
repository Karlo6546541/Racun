import { assertCron } from "@/server/cron";
import { jsonError } from "@/server/errors";
import { sendDailyReminders } from "@/server/push";

export async function GET(req: Request) {
  try {
    assertCron(req);
    return Response.json(await sendDailyReminders());
  } catch (e) {
    return jsonError(e);
  }
}
