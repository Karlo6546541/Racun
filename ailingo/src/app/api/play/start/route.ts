import { jsonRoute } from "@/server/route";
import { StartSchema, startSession } from "@/server/play";
import { requireViewer } from "@/server/viewer";
import { clientIp } from "@/server/ratelimit";

export const POST = jsonRoute(StartSchema, async (input, req) => startSession(await requireViewer(), input, clientIp(req.headers)), { limit: [30, 60] });
