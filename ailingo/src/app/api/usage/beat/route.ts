import { z } from "zod";
import { jsonRoute } from "@/server/route";
import { heartbeat, serializeUsage } from "@/server/usage";
import { requireViewer } from "@/server/viewer";
import { clientIp } from "@/server/ratelimit";

export const POST = jsonRoute(z.object({ sessionId: z.string().max(40).optional() }), async (_i, req) => serializeUsage(await heartbeat(await requireViewer(), clientIp(req.headers))), { limit: [20, 60] });
