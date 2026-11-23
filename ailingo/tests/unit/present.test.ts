import { describe, expect, it } from "vitest";
import { permutation, reveal, toCanonical, toClient, type ClientAnswer, type Ctx } from "@/lib/grading/present";
import { gradeSync } from "@/lib/grading/deterministic";
import { loadContentFromDisk } from "@/lib/content/disk";
import type { Exercise } from "@/lib/content/schema";

const all = loadContentFromDisk().units.flatMap((u) => u.lessons.flatMap((l) => l.exercises));
const ctx: Ctx = { secret: "test-secret", sessionId: "sess1", lang: "hr" };

/** Builds the right answer in displayed space, the way a perfect player would. */
function perfectAnswer(e: Exercise, c: Ctx): ClientAnswer {
  const n = e.type === "mc" || e.type === "doctor" ? e.options.length : e.type === "compare" ? 2 : e.type === "build" ? e.parts.length : e.type === "match" ? e.pairs.length : e.type === "order" ? e.steps.length : 1;
  const p = permutation(n, c.secret, c.sessionId, e.id);
  switch (e.type) {
    case "mc":
    case "doctor":
    case "compare":
      return { kind: "index", value: p.indexOf(e.answer) };
    case "tf":
      return { kind: "index", value: e.answer ? 0 : 1 };
    case "spot":
      return { kind: "index", value: e.bad };
    case "fill":
      return { kind: "text", value: e.answers.hr[0] };
    case "rubric":
      return { kind: "text", value: e.rubric.model[0] };
    case "build":
    case "match":
      return { kind: "list", value: Array.from({ length: n }, (_, i) => p.indexOf(i)) };
    case "order":
      return { kind: "list", value: Array.from({ length: n }, (_, i) => p.indexOf(i)) };
  }
}

describe("client presentation", () => {
  it("permutations are deterministic per secret and session", () => {
    expect(permutation(5, "s", "a", "x")).toEqual(permutation(5, "s", "a", "x"));
    const differs = ["b", "c", "d", "e", "f"].some((sid) => JSON.stringify(permutation(5, "s", sid, "x")) !== JSON.stringify(permutation(5, "s", "a", "x")));
    expect(differs).toBe(true);
    expect([...permutation(4, "s", "a", "x")].sort()).toEqual([0, 1, 2, 3]);
  });
  it("never sends answers, explanations, keywords or model answers to the browser", () => {
    for (const e of all) {
      const json = JSON.stringify(toClient(e, ctx));
      expect(json).not.toContain(e.explain[0]);
      expect(json).not.toMatch(/"answer|"answers|"bad"\s*:\s*\d|"kw"|"model"|"why"/);
      if (e.type === "fill") for (const a of e.answers.hr) expect(json.toLowerCase()).not.toContain(`"${a.toLowerCase()}"`);
    }
  });
  it("a perfect player is graded correct on every one of the 368 exercises", () => {
    for (const e of all) {
      const c = toCanonical(e, perfectAnswer(e, ctx), ctx);
      expect(c, e.id).not.toBeNull();
      expect(gradeSync(e, c!).correct, e.id).toBe(true);
    }
  });
  it("rejects malformed answers", () => {
    const build = all.find((e) => e.type === "build")!;
    expect(toCanonical(build, { kind: "list", value: [0, 0, 1, 2, 3, 4] }, ctx)).toBeNull();
    expect(toCanonical(build, { kind: "index", value: 1 }, ctx)).toBeNull();
    const mc = all.find((e) => e.type === "mc")!;
    expect(toCanonical(mc, { kind: "index", value: 9 }, ctx)).toBeNull();
  });
  it("reveals the correct option in displayed space", () => {
    const mc = all.find((e) => e.type === "mc")! as Extract<Exercise, { type: "mc" }>;
    const a = perfectAnswer(mc, ctx);
    const r = reveal(mc, toCanonical(mc, a, ctx)!, { correct: true, score: 100 }, ctx);
    expect(r.correctIndex).toBe((a as { value: number }).value);
    expect(r.explanation).toBe(mc.explain[0]);
  });
});
