import { jsonRoute } from "@/server/route";
import { AnswerSchema, answer } from "@/server/play";
import { requireViewer } from "@/server/viewer";
import { clientIp } from "@/server/ratelimit";

export const POST = jsonRoute(AnswerSchema, async (input, req) => answer(await requireViewer(), input, clientIp(req.headers)), { limit: [60, 60] });
