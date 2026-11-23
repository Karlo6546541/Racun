import { handlers } from "@/auth";
import { clientIp, rateLimit } from "@/server/ratelimit";
import { jsonError } from "@/server/errors";

export const GET = handlers.GET;

/** Sign-in attempts are rate limited per IP and per email. */
export async function POST(req: Request) {
  try {
    await rateLimit("auth:ip:" + clientIp(req.headers), 10, 60);
    const form = await req.clone().formData().catch(() => null);
    const email = form?.get("email");
    if (typeof email === "string" && email) await rateLimit("auth:email:" + email.toLowerCase(), 5, 600);
  } catch (e) {
    return jsonError(e);
  }
  return handlers.POST(req as Parameters<typeof handlers.POST>[0]);
}
