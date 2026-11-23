import { z } from "zod";
import { jsonRoute } from "@/server/route";
import { requireViewer } from "@/server/viewer";
import { prisma } from "@/server/db";

const Schema = z.object({ endpoint: z.string().url().max(800), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

export const POST = jsonRoute(Schema, async (sub) => {
  const user = await requireViewer();
  await prisma.pushSubscription.upsert({ where: { endpoint: sub.endpoint }, create: { userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, update: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
  return { ok: true };
}, { limit: [10, 60] });
