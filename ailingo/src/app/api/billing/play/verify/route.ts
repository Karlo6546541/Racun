import { z } from "zod";
import { jsonRoute } from "@/server/route";
import { requireViewer } from "@/server/viewer";
import { verifyFromApp } from "@/server/playbilling";
import { serializeUsage, getUsage } from "@/server/usage";
import { clientIp } from "@/server/ratelimit";

/** Called by the Android app after a Google Play purchase. The token is verified with Google before anything changes. */
export const POST = jsonRoute(z.object({ purchaseToken: z.string().min(10).max(4000) }), async ({ purchaseToken }, req) => {
  const user = await requireViewer();
  const result = await verifyFromApp(user, purchaseToken);
  return { status: result?.status ?? null, usage: serializeUsage(await getUsage(user, clientIp(req.headers))) };
}, { limit: [20, 60] });
