import { describe, expect, it } from "vitest";
import { beatCredit, canAnswer, limitSeconds, MAX_BEAT_CREDIT_S, SOFT_LANDING_S, usageStatus } from "@/lib/game/usage";
import { isPremium } from "@/lib/game/entitlement";
import { dayKey, secondsToMidnight, weekKey, daysBetween } from "@/lib/time";

describe("learning-time accounting", () => {
  const t = new Date("2026-05-05T10:00:00Z");
  it("credits real elapsed time, capped per beat", () => {
    expect(beatCredit(null, t)).toBe(15);
    expect(beatCredit(new Date(t.getTime() - 15_000), t)).toBe(15);
    expect(beatCredit(new Date(t.getTime() - 3_600_000), t)).toBe(MAX_BEAT_CREDIT_S);
    expect(beatCredit(new Date(t.getTime() + 5_000), t)).toBe(0);
  });
  it("two tabs sharing lastBeatAt never exceed wall-clock time", () => {
    let last: Date | null = new Date(t.getTime());
    let total = 0;
    for (let s = 1; s <= 60; s++) {
      if (s % 15 === 0 || s % 15 === 7) {
        const now = new Date(t.getTime() + s * 1000);
        total += beatCredit(last, now);
        last = now;
      }
    }
    expect(total).toBeLessThanOrEqual(60);
  });
  it("blocks at the limit, but lets the current exercise finish", () => {
    const lim = limitSeconds(10);
    expect(lim).toBe(600);
    expect(usageStatus(false, 599, lim).blocked).toBe(false);
    expect(usageStatus(false, 600, lim).blocked).toBe(true);
    expect(usageStatus(true, 9999, lim).blocked).toBe(false);
    expect(canAnswer(false, lim + SOFT_LANDING_S, lim)).toBe(true);
    expect(canAnswer(false, lim + SOFT_LANDING_S + 1, lim)).toBe(false);
    expect(canAnswer(true, 99999, lim)).toBe(true);
  });
});

describe("entitlement", () => {
  const now = new Date("2026-05-05T10:00:00Z");
  const sub = (status: string, pastDueSince: Date | null = null) => ({ status, pastDueSince, currentPeriodEnd: null });
  it("active and trialing are premium; canceled and incomplete are not", () => {
    expect(isPremium(sub("active"), null, now)).toBe(true);
    expect(isPremium(sub("trialing"), null, now)).toBe(true);
    expect(isPremium(sub("canceled"), null, now)).toBe(false);
    expect(isPremium(sub("incomplete"), null, now)).toBe(false);
    expect(isPremium(null, null, now)).toBe(false);
  });
  it("past_due keeps premium for a 3-day grace period", () => {
    expect(isPremium(sub("past_due", new Date(now.getTime() - 2 * 864e5)), null, now)).toBe(true);
    expect(isPremium(sub("past_due", new Date(now.getTime() - 4 * 864e5)), null, now)).toBe(false);
  });
  it("admin grants work until they expire", () => {
    expect(isPremium(null, new Date(now.getTime() + 1000), now)).toBe(true);
    expect(isPremium(null, new Date(now.getTime() - 1000), now)).toBe(false);
  });
});

describe("time zone", () => {
  it("uses the local day in Europe/Zagreb", () => {
    expect(dayKey(new Date("2026-05-05T21:59:00Z"))).toBe("2026-05-05");
    expect(dayKey(new Date("2026-05-05T22:01:00Z"))).toBe("2026-05-06");
    expect(dayKey(new Date("2026-01-05T22:59:00Z"))).toBe("2026-01-05");
  });
  it("weeks start on Monday", () => {
    expect(weekKey(new Date("2026-05-10T10:00:00Z"))).toBe("2026-05-04");
    expect(weekKey(new Date("2026-05-04T10:00:00Z"))).toBe("2026-05-04");
  });
  it("counts down to local midnight", () => {
    expect(secondsToMidnight(new Date("2026-05-05T21:59:00Z"))).toBe(60);
    expect(daysBetween("2026-02-27", "2026-03-01")).toBe(2);
  });
});
