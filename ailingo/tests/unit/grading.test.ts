import { describe, expect, it } from "vitest";
import { norm, hasKeyword } from "@/lib/grading/normalize";
import { gradeSync } from "@/lib/grading/deterministic";
import { AiGraderStub, getGrader, gradeWithFallback, DeterministicGrader } from "@/lib/grading";
import { loadContentFromDisk } from "@/lib/content/disk";
import type { Exercise } from "@/lib/content/schema";

const all = loadContentFromDisk().units.flatMap((u) => u.lessons.flatMap((l) => l.exercises));
const of = <T extends Exercise["type"]>(t: T) => all.filter((e): e is Extract<Exercise, { type: T }> => e.type === t);

describe("normalize", () => {
  it("ignores case and Croatian diacritics", () => {
    expect(norm("ČINJENICE")).toBe("cinjenice");
    expect(norm("Đak, Žaba, Šuma, Ćup")).toBe("dak zaba suma cup");
    expect(norm("djak")).toBe(norm("đak"));
    expect(norm("  više   razmaka! ")).toBe("vise razmaka");
  });
  it("matches keywords at word starts only", () => {
    expect(hasKeyword(norm("Ton: topao"), "ton")).toBe(true);
    expect(hasKeyword(norm("klikni button"), "ton")).toBe(false);
    expect(hasKeyword(norm("za vlasnike"), "za ")).toBe(true);
    expect(hasKeyword(norm("zadatak"), "za ")).toBe(false);
  });
});

describe("deterministic grader", () => {
  it("grades every choice-type exercise", () => {
    for (const e of of("mc")) {
      expect(gradeSync(e, { type: "mc", index: e.answer }).correct).toBe(true);
      expect(gradeSync(e, { type: "mc", index: (e.answer + 1) % e.options.length }).correct).toBe(false);
    }
    for (const e of of("tf")) expect(gradeSync(e, { type: "tf", value: e.answer }).correct).toBe(true);
    for (const e of of("compare")) expect(gradeSync(e, { type: "compare", index: 1 - e.answer }).correct).toBe(false);
    for (const e of of("spot")) expect(gradeSync(e, { type: "spot", index: e.bad }).correct).toBe(true);
  });
  it("accepts fill answers regardless of case and diacritics", () => {
    for (const e of of("fill")) {
      expect(gradeSync(e, { type: "fill", text: e.answers.hr[0].toUpperCase() }).correct).toBe(true);
      expect(gradeSync(e, { type: "fill", text: e.answers.en[0] }).correct).toBe(true);
      expect(gradeSync(e, { type: "fill", text: "zzzz" }).correct).toBe(false);
    }
    const e = all.find((x) => x.id === "u1l4e4")!;
    expect(gradeSync(e, { type: "fill", text: "cinjenice" }).correct).toBe(true);
  });
  it("scores ordering tasks partially", () => {
    const e = of("order")[0];
    const r = gradeSync(e, { type: "order", sequence: [1, 0, ...e.steps.slice(2).map((_, i) => i + 2)] });
    expect(r.correct).toBe(false);
    expect(r.score).toBe(Math.round(((e.steps.length - 2) / e.steps.length) * 100));
  });
  it("every rubric model answer passes, in both languages, and a vague prompt fails", () => {
    for (const e of of("rubric")) {
      for (const lang of [0, 1]) {
        const r = gradeSync(e, { type: "rubric", text: e.rubric.model[lang] });
        expect(r.correct, `${e.id} ${lang}`).toBe(true);
      }
      expect(gradeSync(e, { type: "rubric", text: "napiši nešto" }).correct).toBe(false);
    }
  });
  it("rejects an answer of the wrong type", () => {
    expect(gradeSync(of("mc")[0], { type: "fill", text: "x" }).correct).toBe(false);
  });
});

describe("AI grader flag", () => {
  it("is off by default and the stub never succeeds", async () => {
    expect(getGrader({}).id).toBe("deterministic");
    expect(getGrader({ FEATURE_AI_GRADER: "on" }).id).toBe("ai");
    await expect(AiGraderStub.grade(of("mc")[0], { type: "mc", index: 0 })).rejects.toThrow();
  });
  it("falls back to the deterministic grader", async () => {
    const e = of("mc")[0];
    expect(await gradeWithFallback(e, { type: "mc", index: e.answer })).toEqual(await DeterministicGrader.grade(e, { type: "mc", index: e.answer }));
  });
});
