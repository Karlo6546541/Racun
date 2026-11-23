import { prisma } from "@/server/db";
import { getViewer } from "@/server/viewer";
import { dayKey } from "@/lib/time";

/** E2E-only: sets today's used seconds for the current viewer, to test the paywall without waiting. */
export async function POST(req: Request) {
  if (process.env.E2E !== "1" || !process.env.E2E_TEST_SECRET || req.headers.get("x-test-secret") !== process.env.E2E_TEST_SECRET) return new Response("Not found", { status: 404 });
  const user = await getViewer();
  if (!user) return new Response("No viewer", { status: 401 });
  const { seconds } = (await req.json()) as { seconds: number };
  const day = dayKey(new Date(), user.timezone);
  await prisma.dailyUsage.upsert({ where: { subject_day: { subject: "u:" + user.id, day } }, create: { subject: "u:" + user.id, day, seconds }, update: { seconds } });
  await prisma.dailyUsage.deleteMany({ where: { subject: { startsWith: "ip:" }, day } });
  return Response.json({ ok: true });
}
