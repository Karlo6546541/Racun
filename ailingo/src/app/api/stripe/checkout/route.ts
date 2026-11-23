import { z } from "zod";
import { jsonRoute } from "@/server/route";
import { createCheckout } from "@/server/billing";
import { requireViewer } from "@/server/viewer";

export const POST = jsonRoute(
  z.object({ plan: z.enum(["monthly", "yearly"]), locale: z.enum(["hr", "en"]) }),
  async ({ plan, locale }, req) => ({ url: await createCheckout(await requireViewer(), plan, new URL(req.url).origin, locale) }),
  { limit: [10, 60] },
);
