import { expect, test } from "@playwright/test";
import { byLesson, content, onboardAsGuest, playLesson, solve } from "./helpers";

test("guest onboards, finishes the first lesson and unlocks the next", async ({ page }) => {
  await onboardAsGuest(page);
  await expect(page.getByTestId("usage-pill")).toContainText("min");
  await page.locator('.node[data-id="u1l1"]').click();
  await page.getByTestId("start-lesson").click();
  for (const ex of byLesson.get("u1l1")!) await solve(page, ex);
  await expect(page.getByTestId("summary")).toContainText("Lekcija završena");
  await expect(page.getByTestId("summary")).toContainText("100%");
  await page.getByTestId("summary-next").click();
  // ~110 XP for a perfect first lesson crosses level 2 (150 XP needs the second lesson), so either screen may follow
  const levelUp = page.getByRole("heading", { name: "Nova razina!" });
  if (await levelUp.isVisible().catch(() => false)) await page.getByRole("button", { name: "Super!" }).click();
  await expect(page).toHaveURL(/\/learn/);
  await expect(page.locator('.node[data-id="u1l1"]')).toHaveClass(/done/);
  await expect(page.locator('.node[data-id="u1l2"]')).toHaveClass(/open/);
});

test("a wrong answer costs a heart, repeats the exercise and lands in Practice", async ({ page }) => {
  await onboardAsGuest(page);
  await page.goto("/play?mode=LESSON&lesson=u1l1");
  const first = byLesson.get("u1l1")![0];
  await expect(page.locator(".qtext")).toHaveText(first.q[0]);
  await page.waitForTimeout(650);
  // u1l1e1 is multiple choice: click an option that is not the right one
  const wrongText = first.type === "mc" ? first.options[(first.answer + 1) % first.options.length][0] : "";
  await page.locator(".opt", { hasText: wrongText }).click();
  await page.getByTestId("check").click();
  await expect(page.locator(".lfoot.bad")).toBeVisible();
  await expect(page.locator(".lhead")).toContainText("❤️ 4");
  await page.getByTestId("next").click();
  const rest = byLesson.get("u1l1")!.slice(1);
  for (const ex of rest) await solve(page, ex);
  await solve(page, first); // repeated at the end
  await expect(page.getByTestId("summary")).toContainText("⭐⭐");
  await page.goto("/practice");
  await expect(page.locator("main")).toContainText(first.q[0]);
});

test("the AI and Marketing tracks unlock independently", async ({ page }) => {
  await onboardAsGuest(page);
  await page.goto("/learn?track=mk");
  const firstMk = content.units.find((u) => u.track === "mk")!.lessons[0].id;
  await expect(page.locator(`.node[data-id="${firstMk}"]`)).toHaveClass(/open/);
  await playLesson(page, firstMk);
});

test("placement test can skip early lessons", async ({ page }) => {
  await onboardAsGuest(page);
  await page.goto("/play?mode=PLACEMENT");
  const ids = content.meta.placement.exercises;
  const all = new Map(content.units.flatMap((u) => u.lessons.flatMap((l) => l.exercises.map((e) => [e.id, e] as const))));
  for (const id of ids) await solve(page, all.get(id)!);
  await expect(page.getByTestId("summary")).toContainText(`${ids.length}/${ids.length}`);
  await page.goto("/learn");
  await expect(page.locator('.node[data-id="u1l4"]')).toHaveClass(/done/);
});

test("full curriculum: every lesson in both tracks can be completed", async ({ page }) => {
  test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to play all 46 lessons");
  test.setTimeout(60 * 60_000);
  await onboardAsGuest(page);
  // Unlimited time for this long run
  await page.request.post("/api/test/usage", { headers: { "x-test-secret": "e2e-secret" }, data: { seconds: -100000 } });
  for (const u of content.units) for (const l of u.lessons) await playLesson(page, l.id);
});
