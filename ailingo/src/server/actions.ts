"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { GUEST_COOKIE } from "./guest";
import { prisma } from "./db";
import { getOrCreateGuest, requireAdmin, requireViewer } from "./viewer";
import { rateLimit, clientIp } from "./ratelimit";
import { deleteAccount } from "./gdpr";
import { setConfig } from "./config";
import { invalidateContent } from "./content";
import { checkBadges } from "./game";
import { signIn, signOut } from "@/auth";
import { ExerciseSchema } from "@/lib/content/schema";
import { exerciseHash } from "@/lib/content/normalize";
import { MAX_HEARTS } from "@/lib/game/hearts";

const Locale = z.enum(["hr", "en"]);

export async function completeOnboarding(input: { name: string; goal: string; level: string; daily: number; locale: string }) {
  const d = z.object({ name: z.string().trim().max(24), goal: z.enum(["agency", "biz", "free", "daily"]), level: z.enum(["beg", "mid", "adv"]), daily: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]), locale: Locale }).parse(input);
  await rateLimit("onboard:" + clientIp(await headers()), 30, 3600);
  const user = await getOrCreateGuest(d.locale);
  await prisma.user.update({ where: { id: user.id }, data: { onboarded: true, name: d.name || user.name, goal: d.goal, level: d.level, dailyGoalMin: d.daily, locale: d.locale } });
  return { ok: true };
}

export async function startAsGuest(locale: string) {
  const l = Locale.parse(locale);
  await rateLimit("onboard:" + clientIp(await headers()), 30, 3600);
  await getOrCreateGuest(l);
}

const SettingsSchema = z.object({
  name: z.string().trim().max(24).optional(),
  locale: Locale.optional(),
  soundOn: z.boolean().optional(),
  dailyGoalMin: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]).optional(),
  hideFromLeaderboards: z.boolean().optional(),
});
export async function updateSettings(input: z.infer<typeof SettingsSchema>) {
  const user = await requireViewer();
  const data = SettingsSchema.parse(input);
  await prisma.user.update({ where: { id: user.id }, data });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function buyItem(item: "freeze" | "hearts") {
  const user = await requireViewer();
  z.enum(["freeze", "hearts"]).parse(item);
  if (item === "freeze") {
    if (user.gems < 20 || user.streakFreezes >= 2) return { ok: false };
    await prisma.user.update({ where: { id: user.id, gems: { gte: 20 } }, data: { gems: { decrement: 20 }, streakFreezes: { increment: 1 } } });
  } else {
    if (user.gems < 10 || user.hearts >= MAX_HEARTS) return { ok: false };
    await prisma.user.update({ where: { id: user.id, gems: { gte: 10 } }, data: { gems: { decrement: 10 }, hearts: MAX_HEARTS, heartsRefillAt: null } });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function addFriend(query: string): Promise<{ ok: boolean; code?: "notFound" | "self" | "exists" | "guest" | "sent" }> {
  const user = await requireViewer();
  if (user.isGuest) return { ok: false, code: "guest" };
  await rateLimit("friend:" + user.id, 20, 3600);
  const q = z.string().trim().min(3).max(120).parse(query);
  const other = await prisma.user.findFirst({ where: q.includes("@") ? { email: q.toLowerCase(), isGuest: false } : { friendCode: q.toUpperCase(), isGuest: false } });
  if (!other) return { ok: false, code: "notFound" };
  if (other.id === user.id) return { ok: false, code: "self" };
  const existing = await prisma.friendship.findFirst({ where: { OR: [{ requesterId: user.id, addresseeId: other.id }, { requesterId: other.id, addresseeId: user.id }] } });
  if (existing) return { ok: false, code: "exists" };
  await prisma.friendship.create({ data: { requesterId: user.id, addresseeId: other.id } });
  revalidatePath("/friends");
  return { ok: true, code: "sent" };
}

export async function respondFriend(id: string, action: "accept" | "decline" | "remove") {
  const user = await requireViewer();
  const f = await prisma.friendship.findUnique({ where: { id: z.string().max(40).parse(id) } });
  if (!f || (f.addresseeId !== user.id && f.requesterId !== user.id)) return { ok: false };
  if (action === "accept" && f.addresseeId === user.id) {
    await prisma.friendship.update({ where: { id: f.id }, data: { status: "ACCEPTED" } });
    await checkBadges(prisma, f.requesterId);
    await checkBadges(prisma, f.addresseeId);
  } else await prisma.friendship.delete({ where: { id: f.id } });
  revalidatePath("/friends");
  return { ok: true };
}

export async function deleteMyAccount() {
  const user = await requireViewer();
  await deleteAccount(user.id);
  // The session row was deleted with the user (cascade), so only the cookies remain to clear.
  const jar = await cookies();
  for (const name of ["authjs.session-token", "__Secure-authjs.session-token", GUEST_COOKIE]) jar.delete(name);
  return { ok: true };
}

export async function emailSignIn(email: string, locale: string) {
  const e = z.string().trim().email().max(200).parse(email);
  await rateLimit("auth:email:" + e.toLowerCase(), 5, 600);
  await signIn("nodemailer", { email: e, redirectTo: locale === "en" ? "/en/learn" : "/learn" });
}

export async function googleSignIn(locale: string) {
  await signIn("google", { redirectTo: locale === "en" ? "/en/learn" : "/learn" });
}

export async function doSignOut() {
  await signOut({ redirectTo: "/" });
}

// ---------- Admin ----------
export async function adminSaveExercise(id: string, json: string): Promise<{ ok: boolean; errors?: string[] }> {
  await requireAdmin();
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, errors: ["JSON syntax error"] };
  }
  const p = ExerciseSchema.safeParse(raw);
  if (!p.success) return { ok: false, errors: p.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  const ex = { ...p.data, id };
  await prisma.exercise.update({ where: { id }, data: { type: ex.type, payload: ex, contentHash: exerciseHash(ex) } });
  invalidateContent();
  revalidatePath("/admin");
  return { ok: true };
}

export async function adminSetFreeMinutes(minutes: number) {
  await requireAdmin();
  const m = z.number().min(0).max(1440).parse(minutes);
  await setConfig("FREE_DAILY_MINUTES", String(m));
  revalidatePath("/admin");
  return { ok: true };
}

export async function adminGrantPremium(email: string, days: number) {
  await requireAdmin();
  const e = z.string().email().parse(email);
  const d = z.number().int().min(0).max(3650).parse(days);
  const u = await prisma.user.findUnique({ where: { email: e.toLowerCase() } });
  if (!u) return { ok: false };
  await prisma.user.update({ where: { id: u.id }, data: { premiumUntil: d ? new Date(Date.now() + d * 864e5) : null } });
  return { ok: true };
}

export async function adminClearFlag(userId: string) {
  await requireAdmin();
  await prisma.user.update({ where: { id: z.string().max(40).parse(userId) }, data: { flagged: false, flagReason: null } });
  revalidatePath("/admin");
  return { ok: true };
}
