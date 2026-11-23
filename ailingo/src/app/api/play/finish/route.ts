import { z } from "zod";
import { jsonRoute } from "@/server/route";
import { finishSession } from "@/server/play";
import { requireViewer } from "@/server/viewer";

export const POST = jsonRoute(z.object({ sessionId: z.string().min(1).max(40) }), async ({ sessionId }) => finishSession(await requireViewer(), sessionId), { limit: [30, 60] });
