import { z } from "zod";
import { jsonRoute } from "@/server/route";
import { createPortal } from "@/server/billing";
import { requireViewer } from "@/server/viewer";

export const POST = jsonRoute(z.object({ locale: z.enum(["hr", "en"]) }), async ({ locale }, req) => ({ url: await createPortal(await requireViewer(), new URL(req.url).origin, locale) }), { limit: [10, 60] });
