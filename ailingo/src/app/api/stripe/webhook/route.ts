import { handleWebhook } from "@/server/billing";
import { jsonError } from "@/server/errors";

/** Premium changes only here, from a signed Stripe event, never from a redirect. */
export async function POST(req: Request) {
  try {
    const processed = await handleWebhook(await req.text(), req.headers.get("stripe-signature"));
    return Response.json({ received: true, duplicate: !processed });
  } catch (e) {
    return jsonError(e);
  }
}
