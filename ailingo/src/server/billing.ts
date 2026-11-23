import Stripe from "stripe";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { AppError } from "./errors";
import { track } from "./analytics";

let client: Stripe | null = null;
export function stripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_MONTHLY && process.env.STRIPE_PRICE_YEARLY);
}
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new AppError("NOT_FOUND", "Payments are not configured");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

async function customerFor(user: User): Promise<string> {
  const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
  if (sub?.stripeCustomerId) return sub.stripeCustomerId;
  if (sub?.provider === "play" && sub.status === "active") throw new AppError("CONFLICT", "Already subscribed through Google Play");
  const c = await stripe().customers.create({ email: user.email ?? undefined, metadata: { userId: user.id } });
  await prisma.subscription.upsert({ where: { userId: user.id }, create: { userId: user.id, stripeCustomerId: c.id, status: "incomplete" }, update: { provider: "stripe", stripeCustomerId: c.id, status: "incomplete", playPurchaseToken: null, playProductId: null } });
  return c.id;
}

export async function createCheckout(user: User, plan: "monthly" | "yearly", origin: string, locale: string): Promise<string> {
  if (user.isGuest || !user.email) throw new AppError("UNAUTHENTICATED", "Sign in to subscribe");
  const price = plan === "yearly" ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY;
  if (!price) throw new AppError("NOT_FOUND", "Price is not configured");
  const trialDays = Number(process.env.STRIPE_TRIAL_DAYS || 0);
  const prefix = locale === "en" ? "/en" : "";
  const s = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: await customerFor(user),
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    automatic_tax: { enabled: process.env.STRIPE_TAX === "on" },
    customer_update: process.env.STRIPE_TAX === "on" ? { address: "auto" } : undefined,
    subscription_data: { metadata: { userId: user.id, plan }, ...(trialDays > 0 ? { trial_period_days: trialDays } : {}) },
    locale: locale === "en" ? "en" : "hr",
    success_url: `${origin}${prefix}/premium?status=success`,
    cancel_url: `${origin}${prefix}/premium?status=cancel`,
  });
  await track("checkout_started");
  return s.url!;
}

export async function createPortal(user: User, origin: string, locale: string): Promise<string> {
  const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
  if (!sub?.stripeCustomerId) throw new AppError("NOT_FOUND", "No subscription");
  const s = await stripe().billingPortal.sessions.create({ customer: sub.stripeCustomerId, return_url: `${origin}${locale === "en" ? "/en" : ""}/premium` });
  return s.url;
}

type SubData = { id: string; customer: string | { id: string }; status: string; cancel_at_period_end: boolean; trial_end: number | null; metadata?: Record<string, string>; items?: { data: { current_period_end?: number; price?: { recurring?: { interval?: string } | null } }[] }; current_period_end?: number };

function periodEnd(s: SubData): Date | null {
  const t = s.items?.data?.[0]?.current_period_end ?? s.current_period_end;
  return t ? new Date(t * 1000) : null;
}

/** Applies a subscription object from Stripe. The only way premium status changes (besides admin grants). */
export async function syncSubscription(s: SubData) {
  const customerId = typeof s.customer === "string" ? s.customer : s.customer.id;
  const existing = await prisma.subscription.findUnique({ where: { stripeCustomerId: customerId } });
  const userId = existing?.userId ?? s.metadata?.userId;
  if (!userId) return;
  const interval = s.items?.data?.[0]?.price?.recurring?.interval;
  const plan = s.metadata?.plan ?? (interval === "year" ? "yearly" : interval === "month" ? "monthly" : null);
  const pastDueSince = s.status === "past_due" ? existing?.pastDueSince ?? new Date() : null;
  const data = { provider: "stripe", stripeSubscriptionId: s.id, status: s.status, plan, currentPeriodEnd: periodEnd(s), cancelAtPeriodEnd: s.cancel_at_period_end, trialEnd: s.trial_end ? new Date(s.trial_end * 1000) : null, pastDueSince };
  await prisma.subscription.upsert({ where: { stripeCustomerId: customerId }, create: { userId, stripeCustomerId: customerId, ...data }, update: data });
}

/** Verifies, de-duplicates and applies a webhook. Returns false when the event was already processed. */
export async function handleWebhook(payload: string, signature: string | null): Promise<boolean> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) throw new AppError("BAD_REQUEST", "Missing signature");
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    throw new AppError("BAD_REQUEST", "Invalid signature");
  }
  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch {
    return false;
  }
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const cs = event.data.object as Stripe.Checkout.Session;
        if (cs.subscription && process.env.STRIPE_SECRET_KEY) {
          const sub = await stripe().subscriptions.retrieve(typeof cs.subscription === "string" ? cs.subscription : cs.subscription.id);
          await syncSubscription(sub as unknown as SubData);
        }
        await track("subscribed");
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await syncSubscription(event.data.object as unknown as SubData);
        break;
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object as unknown as SubData);
        await track("canceled");
        break;
      case "invoice.payment_failed":
      case "invoice.paid": {
        const inv = event.data.object as unknown as { customer: string | { id: string }; parent?: { subscription_details?: { subscription?: string } }; subscription?: string };
        const subId = inv.parent?.subscription_details?.subscription ?? inv.subscription;
        if (subId && process.env.STRIPE_SECRET_KEY) await syncSubscription((await stripe().subscriptions.retrieve(subId)) as unknown as SubData);
        break;
      }
    }
  } catch (e) {
    await prisma.stripeEvent.delete({ where: { id: event.id } }).catch(() => {});
    throw e;
  }
  return true;
}

/** GDPR deletion: cancel the subscription immediately and remove the Stripe customer. */
export async function cancelForDeletion(userId: string) {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub?.stripeCustomerId || !process.env.STRIPE_SECRET_KEY) return;
  if (sub.stripeSubscriptionId && !["canceled", "incomplete_expired"].includes(sub.status)) await stripe().subscriptions.cancel(sub.stripeSubscriptionId).catch(() => {});
  await stripe().customers.del(sub.stripeCustomerId).catch(() => {});
}
