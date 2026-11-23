import { timingSafeEqual } from "node:crypto";
import { parseRtdn } from "@/lib/game/playstate";
import { playConfig, syncPlayPurchase } from "@/server/playbilling";
import { jsonError } from "@/server/errors";

/**
 * Google Play Real-time Developer Notifications (Pub/Sub push).
 * The push subscription URL must carry ?token=PLAY_RTDN_TOKEN. Each notification is re-verified with Google.
 */
export async function POST(req: Request) {
  try {
    const expected = process.env.PLAY_RTDN_TOKEN;
    const got = new URL(req.url).searchParams.get("token") ?? "";
    if (!expected || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return new Response("Forbidden", { status: 403 });
    const n = parseRtdn(await req.json().catch(() => null));
    if (!n || n.packageName !== playConfig().packageName) return Response.json({ ignored: true });
    await syncPlayPurchase(n.purchaseToken, null);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
