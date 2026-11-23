import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { friendCode, unsign } from "@/server/codes";
import { GUEST_COOKIE, mergeGuestInto } from "@/server/guest";

/**
 * E2E-only stand-in for Google sign-in: creates a database session exactly like Auth.js does.
 * Disabled unless E2E=1 and the request carries E2E_TEST_SECRET.
 */
export async function POST(req: Request) {
  if (process.env.E2E !== "1" || !process.env.E2E_TEST_SECRET || req.headers.get("x-test-secret") !== process.env.E2E_TEST_SECRET) return new Response("Not found", { status: 404 });
  const { email, name } = (await req.json()) as { email: string; name?: string };
  const user = await prisma.user.upsert({ where: { email }, create: { email, name: name ?? "Tester", friendCode: friendCode(), emailVerified: new Date() }, update: {} });
  const jar = await cookies();
  const guestId = unsign(jar.get(GUEST_COOKIE)?.value);
  if (guestId && guestId !== user.id) {
    await mergeGuestInto(guestId, user.id);
    jar.delete(GUEST_COOKIE);
  }
  const sessionToken = randomBytes(32).toString("hex");
  await prisma.session.create({ data: { sessionToken, userId: user.id, expires: new Date(Date.now() + 864e5) } });
  jar.set("authjs.session-token", sessionToken, { httpOnly: true, sameSite: "lax", path: "/" });
  return Response.json({ userId: user.id });
}
