import { expect, test } from "@playwright/test";
import Stripe from "stripe";
import { onboardAsGuest, SECRET, solve, byLesson } from "./helpers";

test("free users hit the paywall after their daily minutes", async ({ page }) => {
  await onboardAsGuest(page);
  await page.request.post("/api/test/usage", { headers: SECRET, data: { seconds: 600 } });
  await page.goto("/play?mode=LESSON&lesson=u1l1");
  await expect(page.getByTestId("paywall")).toBeVisible();
  await expect(page.getByTestId("paywall")).toContainText("10 min");
  // Server enforces it too, not just the UI
  const r = await page.request.post("/api/play/start", { data: { mode: "BLITZ" } });
  expect(r.status()).toBe(402);
});

test("an exercise in progress can still be finished, then the paywall shows and the lesson resumes later", async ({ page }) => {
  await onboardAsGuest(page);
  await page.goto("/play?mode=LESSON&lesson=u1l1");
  const [e1, e2] = byLesson.get("u1l1")!;
  await solve(page, e1);
  await page.request.post("/api/test/usage", { headers: SECRET, data: { seconds: 600 } });
  await expect(page.locator(".qtext")).toHaveText(e2.q[0]);
  await page.waitForTimeout(650);
  await page.locator(".lbody .opt").first().click();
  await page.getByTestId("check").click();
  await expect(page.locator(".lfoot.ok, .lfoot.bad")).toBeVisible();
  await page.getByTestId("next").click();
  await expect(page.getByTestId("paywall")).toBeVisible();
  // Next day (simulated by resetting usage) the lesson resumes where it stopped
  await page.request.post("/api/test/usage", { headers: SECRET, data: { seconds: 0 } });
  await page.goto("/play?mode=LESSON&lesson=u1l1");
  await expect(page.locator(".qtext")).not.toHaveText(e1.q[0]);
});

test("a signed Stripe webhook turns on Premium, which removes the limit", async ({ page }) => {
  await onboardAsGuest(page);
  const login = await page.request.post("/api/test/login", { headers: SECRET, data: { email: "payer@ailingo.test", name: "Payer" } });
  const { userId } = await login.json();
  await page.request.post("/api/test/usage", { headers: SECRET, data: { seconds: 5000 } });
  await page.goto("/play?mode=LESSON&lesson=u1l1");
  await expect(page.getByTestId("paywall")).toBeVisible();

  const event = {
    id: "evt_e2e_1",
    object: "event",
    type: "customer.subscription.created",
    data: { object: { id: "sub_e2e", object: "subscription", customer: "cus_e2e", status: "active", cancel_at_period_end: false, trial_end: null, metadata: { userId, plan: "monthly" }, items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400, price: { recurring: { interval: "month" } } }] } } },
  };
  const payload = JSON.stringify(event);
  const bad = await page.request.post("/api/stripe/webhook", { data: payload, headers: { "stripe-signature": "t=1,v1=forged", "content-type": "application/json" } });
  expect(bad.status()).toBe(400);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_e2e_test" });
  const ok = await page.request.post("/api/stripe/webhook", { data: payload, headers: { "stripe-signature": header, "content-type": "application/json" } });
  expect(ok.status()).toBe(200);
  const dup = await page.request.post("/api/stripe/webhook", { data: payload, headers: { "stripe-signature": header, "content-type": "application/json" } });
  expect((await dup.json()).duplicate).toBe(true);

  await page.goto("/learn");
  await expect(page.getByTestId("usage-pill")).toContainText("Premium");
  await page.goto("/play?mode=LESSON&lesson=u1l1");
  await expect(page.locator(".qtext")).toBeVisible();

  // Cancellation (deleted) removes Premium again
  const del = JSON.stringify({ ...event, id: "evt_e2e_2", type: "customer.subscription.deleted", data: { object: { ...event.data.object, status: "canceled" } } });
  await page.request.post("/api/stripe/webhook", { data: del, headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload: del, secret: "whsec_e2e_test" }), "content-type": "application/json" } });
  await page.goto("/play?mode=LESSON&lesson=u1l2");
  await expect(page.getByTestId("paywall")).toBeVisible();
});
