import { prisma } from "./db";
import { dayKey } from "@/lib/time";

export type EventName = "paywall_shown" | "checkout_started" | "subscribed" | "canceled" | "signup" | "lesson_completed";

/** Aggregated counters only: no user ids, no third-party trackers. */
export async function track(name: EventName) {
  const day = dayKey();
  await prisma.analyticsEvent.upsert({ where: { name_day: { name, day } }, create: { name, day, count: 1 }, update: { count: { increment: 1 } } }).catch(() => {});
}
