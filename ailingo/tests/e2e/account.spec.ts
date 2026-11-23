import { expect, test } from "@playwright/test";
import { onboardAsGuest, playLesson, SECRET } from "./helpers";

test("guest progress carries over on sign-in", async ({ page }) => {
  await onboardAsGuest(page, "Gost Ivo");
  await playLesson(page, "u1l1");
  await page.request.post("/api/test/login", { headers: SECRET, data: { email: "ivo@ailingo.test", name: "Ivo" } });
  await page.goto("/profile");
  await expect(page.locator("main")).toContainText("Ivo");
  await expect(page.locator("main")).toContainText(/Raz\. \d+ · [1-9]\d* XP/);
  await page.goto("/learn");
  await expect(page.locator('.node[data-id="u1l1"]')).toHaveClass(/done/);
});

test("leagues show 30 competitors including me, and global/friends boards render", async ({ page }) => {
  await onboardAsGuest(page);
  await page.request.post("/api/test/login", { headers: SECRET, data: { email: "league@ailingo.test", name: "Liga" } });
  await playLesson(page, "u1l1");
  await page.goto("/leagues");
  await expect(page.getByTestId("league").locator("li")).toHaveCount(30);
  await expect(page.getByTestId("league").locator("li.me")).toContainText("Liga");
  await page.goto("/leagues?tab=global");
  await expect(page.locator(".lb li.me")).toContainText("Liga");
  await page.goto("/leagues?tab=friends");
  await expect(page.locator(".lb li")).toHaveCount(1);
});

test("friends can connect by code", async ({ page, browser }) => {
  await onboardAsGuest(page);
  await page.request.post("/api/test/login", { headers: SECRET, data: { email: "a@ailingo.test", name: "Ana" } });
  await page.goto("/friends");
  const code = (await page.getByTestId("friend-code").innerText()).trim();

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await onboardAsGuest(p2);
  await p2.request.post("/api/test/login", { headers: SECRET, data: { email: "b@ailingo.test", name: "Bruno" } });
  await p2.goto("/friends");
  await p2.getByPlaceholder("Kod (AIL-…) ili email").fill(code);
  await p2.getByRole("button", { name: "Pošalji zahtjev" }).click();
  await expect(p2.getByRole("status")).toContainText("Zahtjev poslan");
  await page.reload();
  await page.getByRole("button", { name: "Prihvati" }).click();
  await expect(page.locator("main")).toContainText("Bruno");
  await ctx.close();
});

test("answers are never sent to the browser and bots are slowed down", async ({ page }) => {
  await onboardAsGuest(page);
  const r = await page.request.post("/api/play/start", { data: { mode: "LESSON", lessonId: "u1l1" } });
  const s = await r.json();
  const json = JSON.stringify(s.exercises);
  expect(json).not.toMatch(/"answer"|"answers"|"explain"|"kw"|"model"/);
  const fast = await page.request.post("/api/play/answer", { data: { sessionId: s.sessionId, exerciseId: s.exercises[0].id, answer: { kind: "index", value: 0 } } });
  expect(fast.status()).toBe(429);
  const other = await page.request.post("/api/play/answer", { data: { sessionId: s.sessionId, exerciseId: "nope", answer: { kind: "index", value: 0 } } });
  expect(other.status()).toBe(400);
});

test("export and permanent deletion (GDPR)", async ({ page }) => {
  await onboardAsGuest(page);
  await page.request.post("/api/test/login", { headers: SECRET, data: { email: "gdpr@ailingo.test", name: "Gdpr" } });
  const exp = await page.request.get("/api/me/export");
  expect(exp.status()).toBe(200);
  expect((await exp.json()).user.email).toBe("gdpr@ailingo.test");
  await page.goto("/settings");
  await page.getByTestId("delete").click();
  await page.getByTestId("delete").click();
  await expect(page).toHaveURL(/\/$/);
  expect((await page.request.get("/api/me/export")).status()).toBe(401);
});

test("English locale works", async ({ page }) => {
  await page.goto("/en");
  await expect(page.getByTestId("cta")).toHaveText(/Get started free/i);
});
