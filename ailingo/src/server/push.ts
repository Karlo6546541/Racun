import * as webpush from "web-push";
import { prisma } from "./db";
import { dayKey } from "@/lib/time";

export function pushEnabled() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Sends one reminder to users who have not learned today. Email reminders are off by default. */
export async function sendDailyReminders() {
  if (!pushEnabled()) return { sent: 0, skipped: "VAPID not configured" };
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const subs = await prisma.pushSubscription.findMany({ include: { user: { select: { id: true, locale: true, timezone: true } } } });
  let sent = 0;
  for (const s of subs) {
    const active = await prisma.xPEvent.count({ where: { userId: s.user.id, dayKey: dayKey(new Date(), s.user.timezone) } });
    if (active) continue;
    const en = s.user.locale === "en";
    const body = JSON.stringify({ title: "AIlingo", body: en ? "5 minutes today keeps your streak alive 🔥" : "5 minuta danas čuva tvoj niz 🔥", url: en ? "/en/learn" : "/learn" });
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
    }
  }
  return { sent };
}
