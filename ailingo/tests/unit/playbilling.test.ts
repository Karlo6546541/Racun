import { describe, expect, it } from "vitest";
import { mapPlayState, parseRtdn } from "@/lib/game/playstate";
import { isPremium } from "@/lib/game/entitlement";

const now = new Date("2026-06-01T10:00:00Z");
const item = (expiry: string, autoRenew = true) => [{ productId: "ailingo_premium_monthly", expiryTime: expiry, autoRenewingPlan: { autoRenewEnabled: autoRenew } }];

describe("Google Play subscription state", () => {
  it("maps active, grace, canceled-but-paid and expired", () => {
    expect(mapPlayState({ subscriptionState: "SUBSCRIPTION_STATE_ACTIVE", lineItems: item("2026-07-01T00:00:00Z") }, now)).toMatchObject({ status: "active", cancelAtPeriodEnd: false });
    expect(mapPlayState({ subscriptionState: "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", lineItems: item("2026-06-02T00:00:00Z") }, now).status).toBe("active");
    expect(mapPlayState({ subscriptionState: "SUBSCRIPTION_STATE_CANCELED", lineItems: item("2026-06-20T00:00:00Z", false) }, now)).toMatchObject({ status: "active", cancelAtPeriodEnd: true });
    expect(mapPlayState({ subscriptionState: "SUBSCRIPTION_STATE_CANCELED", lineItems: item("2026-05-20T00:00:00Z", false) }, now).status).toBe("canceled");
    expect(mapPlayState({ subscriptionState: "SUBSCRIPTION_STATE_EXPIRED", lineItems: item("2026-05-20T00:00:00Z") }, now).status).toBe("canceled");
    expect(mapPlayState({ subscriptionState: "SUBSCRIPTION_STATE_ON_HOLD" }, now).status).toBe("on_hold");
    expect(mapPlayState({ subscriptionState: "SUBSCRIPTION_STATE_PENDING" }, now).status).toBe("incomplete");
  });
  it("flags purchases that still need acknowledging", () => {
    expect(mapPlayState({ subscriptionState: "SUBSCRIPTION_STATE_ACTIVE", acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING" }, now).needsAck).toBe(true);
  });
  it("on hold and pending give no premium; active does", () => {
    for (const s of ["on_hold", "paused", "incomplete", "canceled"]) expect(isPremium({ status: s, pastDueSince: null, currentPeriodEnd: null }, null, now)).toBe(false);
    expect(isPremium({ status: "active", pastDueSince: null, currentPeriodEnd: new Date("2026-07-01") }, null, now)).toBe(true);
  });
  it("stops premium when a period ended long ago (missed notification safety net)", () => {
    expect(isPremium({ status: "active", pastDueSince: null, currentPeriodEnd: new Date("2026-05-01") }, null, now)).toBe(false);
    expect(isPremium({ status: "active", pastDueSince: null, currentPeriodEnd: new Date("2026-05-30") }, null, now)).toBe(true);
  });
  it("parses Real-time Developer Notifications", () => {
    const data = Buffer.from(JSON.stringify({ packageName: "hr.ailingo.app", subscriptionNotification: { purchaseToken: "tok", subscriptionId: "ailingo_premium_monthly", notificationType: 4 } })).toString("base64");
    expect(parseRtdn({ message: { data } })).toEqual({ purchaseToken: "tok", packageName: "hr.ailingo.app", productId: "ailingo_premium_monthly", type: 4 });
    expect(parseRtdn({ message: { data: "not-json" } })).toBeNull();
    expect(parseRtdn({})).toBeNull();
  });
});
