import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "./db";
import { friendCode, sign, unsign } from "./codes";
import { GUEST_COOKIE } from "./guest";
import { AppError } from "./errors";

/** The signed-in user, or the guest bound to the signed cookie, or null. */
export async function getViewer(): Promise<User | null> {
  const session = await auth();
  if (session?.user?.id) return prisma.user.findUnique({ where: { id: session.user.id } });
  const jar = await cookies();
  const gid = unsign(jar.get(GUEST_COOKIE)?.value);
  if (!gid) return null;
  return prisma.user.findFirst({ where: { id: gid, isGuest: true } });
}

export async function requireViewer(): Promise<User> {
  const v = await getViewer();
  if (!v) throw new AppError("UNAUTHENTICATED");
  return v;
}

/** Creates a guest account bound to an httpOnly cookie. Only callable from route handlers or server actions. */
export async function getOrCreateGuest(locale: string): Promise<User> {
  const v = await getViewer();
  if (v) return v;
  const user = await prisma.user.create({ data: { isGuest: true, friendCode: friendCode(), locale } });
  const jar = await cookies();
  jar.set(GUEST_COOKIE, sign(user.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 365 * 24 * 3600 });
  return user;
}

export async function requireAdmin(): Promise<User> {
  const v = await requireViewer();
  if (v.role !== "ADMIN") throw new AppError("FORBIDDEN");
  return v;
}
