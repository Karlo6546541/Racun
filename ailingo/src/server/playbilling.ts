import { createSign } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { AppError } from "./errors";
import { track } from "./analytics";
import { mapPlayState, type PlaySubscription } from "@/lib/game/playstate";

const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

export function playConfig() {
  return {
    packageName: process.env.ANDROID_PACKAGE || "hr.ailingo.app",
    monthly: process.env.PLAY_PRODUCT_MONTHLY || "ailingo_premium_monthly",
    yearly: process.env.PLAY_PRODUCT_YEARLY || "ailingo_premium_yearly",
  };
}

export function playEnabled() {
  return Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT);
}

type ServiceAccount = { client_email: string; private_key: string };
let tokenCache: { token: string; exp: number } | null = null;

/** OAuth access token for the Play Developer API from a service account (JWT bearer flow, no SDK). */
async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT;
  if (!raw) throw new AppError("NOT_FOUND", "Google Play is not configured");
  const sa = JSON.parse(raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")) as ServiceAccount;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!r.ok) throw new Error(`Google token error ${r.status}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

async function play(path: string, method: "GET" | "POST" = "GET") {
  const r = await fetch(`${API}/${playConfig().packageName}/${path}`, { method, headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (r.status === 404 || r.status === 410) throw new AppError("NOT_FOUND", "Purchase not found");
  if (!r.ok) throw new Error(`Play API ${r.status}`);
  return r.status === 204 ? null : r.json();
}

/** Verifies a purchase token with Google and stores it. Premium is granted only from Google's answer, never from the client. */
export async function syncPlayPurchase(purchaseToken: string, userId: string | null) {
  const p = (await play(`purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`)) as PlaySubscription;
  const m = mapPlayState(p);
  const cfg = playConfig();
  if (m.productId && ![cfg.monthly, cfg.yearly].includes(m.productId)) throw new AppError("BAD_REQUEST", "Unknown product");

  const existing = await prisma.subscription.findUnique({ where: { playPurchaseToken: purchaseToken } });
  if (existing && userId && existing.userId !== userId) throw new AppError("CONFLICT", "This purchase belongs to another account");
  // An upgrade or resubscribe links to the previous token: move that record to the new token.
  const previous = !existing && p.linkedPurchaseToken ? await prisma.subscription.findUnique({ where: { playPurchaseToken: p.linkedPurchaseToken } }) : null;
  const owner = existing?.userId ?? previous?.userId ?? userId;
  if (!owner) return null;

  const data = {
    provider: "play",
    playPurchaseToken: purchaseToken,
    playProductId: m.productId,
    status: m.status,
    plan: m.productId === cfg.yearly ? "yearly" : "monthly",
    currentPeriodEnd: m.currentPeriodEnd,
    cancelAtPeriodEnd: m.cancelAtPeriodEnd,
    pastDueSince: null,
  };
  await prisma.subscription.upsert({ where: { userId: owner }, create: { userId: owner, ...data }, update: data });
  if (m.needsAck && m.productId) {
    await play(`purchases/subscriptions/${m.productId}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`, "POST");
    await track("subscribed");
  }
  return m;
}

export async function verifyFromApp(user: User, purchaseToken: string) {
  if (user.isGuest) throw new AppError("UNAUTHENTICATED", "Sign in to subscribe");
  return syncPlayPurchase(purchaseToken, user.id);
}

/** GDPR deletion: cancel auto-renewal on Google Play. */
export async function cancelPlayForDeletion(userId: string) {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub?.playPurchaseToken || !sub.playProductId || !playEnabled() || sub.status === "canceled") return;
  await play(`purchases/subscriptions/${sub.playProductId}/tokens/${encodeURIComponent(sub.playPurchaseToken)}:cancel`, "POST").catch(() => {});
}
