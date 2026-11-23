import { expect, type Page } from "@playwright/test";
import { loadContentFromDisk } from "../../src/lib/content/disk";
import type { Exercise, Txt } from "../../src/lib/content/schema";

export const content = loadContentFromDisk();
export const byLesson = new Map(content.units.flatMap((u) => u.lessons.map((l) => [l.id, l.exercises] as const)));
const L = (t: Txt) => t[0];
const rx = (t: string) => new RegExp("^\\s*" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$");

export async function onboardAsGuest(page: Page, name = "Tester") {
  await page.goto("/");
  await page.getByTestId("cta").click();
  await page.getByPlaceholder("Tvoje ime").fill(name);
  await page.getByRole("button", { name: "Dalje" }).click();
  await page.locator(".choice").first().click();
  await page.getByRole("button", { name: "Dalje" }).click();
  await page.locator(".choice").first().click();
  await page.getByRole("button", { name: "Dalje" }).click();
  await page.getByRole("button", { name: "Dalje" }).click();
  await page.getByTestId("ob-done").click();
  await expect(page).toHaveURL(/\/learn/);
}

/** Answers one exercise correctly by matching visible text against the content files (Croatian UI). */
export async function solve(page: Page, ex: Exercise) {
  const body = page.locator(".lbody");
  await expect(page.locator(".qtext")).toHaveText(L(ex.q));
  await page.waitForTimeout(650); // the server rejects answers faster than a human could give them
  switch (ex.type) {
    case "mc":
      await body.locator(".opt").filter({ has: page.locator(".t", { hasText: rx(L(ex.options[ex.answer])) }) }).click();
      break;
    case "doctor":
      await body.locator(".opt").filter({ has: page.locator(".t", { hasText: rx(L(ex.options[ex.answer].t)) }) }).click();
      break;
    case "compare":
      await body.locator(".opt").filter({ has: page.locator(".t", { hasText: rx(L(ex.answer === 0 ? ex.a : ex.b)) }) }).click();
      break;
    case "tf":
      await body.locator(".opt").nth(ex.answer ? 0 : 1).click();
      break;
    case "fill":
      await body.locator("input").fill(ex.answers.hr[0].toUpperCase());
      break;
    case "spot":
      await body.locator(".seg").nth(ex.bad).click();
      break;
    case "rubric":
      await body.locator("textarea").fill(L(ex.rubric.model));
      break;
    case "build":
      for (const p of ex.parts) await body.locator(".chip").filter({ hasText: rx(L(p)) }).first().click();
      break;
    case "order":
      for (const s of ex.steps) await body.locator(".chip").filter({ hasText: rx(L(s)) }).first().click();
      break;
    case "match":
      for (const [l, r] of ex.pairs) {
        await body.locator(".mcol").nth(0).locator(".mi").filter({ hasText: rx(L(l)) }).click();
        await body.locator(".mcol").nth(1).locator(".mi").filter({ hasText: rx(L(r)) }).click();
      }
      break;
  }
  await page.getByTestId("check").click();
  await expect(page.locator(".lfoot.ok, .lfoot.bad")).toBeVisible();
  await expect(page.locator(".lfoot.ok"), `exercise ${ex.id} should be graded correct`).toBeVisible();
  await page.getByTestId("next").click();
}

export async function playLesson(page: Page, lessonId: string) {
  await page.goto(`/play?mode=LESSON&lesson=${lessonId}`);
  for (const ex of byLesson.get(lessonId)!) await solve(page, ex);
  await expect(page.getByTestId("summary")).toBeVisible();
}

export const SECRET = { "x-test-secret": "e2e-secret" };
