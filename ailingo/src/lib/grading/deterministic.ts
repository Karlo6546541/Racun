import type { Exercise } from "../content/schema";
import { hasKeyword, norm, wordCount } from "./normalize";
import type { CanonicalAnswer, ChecklistItem, Grader, GradeResult } from "./types";

function ratio(ok: number, n: number): GradeResult {
  return { correct: ok === n, score: Math.round((ok / n) * 100) };
}
const all = (r: boolean): GradeResult => ({ correct: r, score: r ? 100 : 0 });

export function gradeRubric(ex: Extract<Exercise, { type: "rubric" }>, text: string): GradeResult {
  const r = ex.rubric;
  const tx = norm(text);
  const list: ChecklistItem[] = [];
  list.push({
    id: "len",
    label: [`Najmanje ${r.minWords} riječi`, `At least ${r.minWords} words`],
    pts: r.lenPts,
    passed: wordCount(text) >= r.minWords,
    hint: ["Opišite zahtjev malo detaljnije.", "Describe the request in a bit more detail."],
  });
  for (const c of r.criteria) {
    const kws = [...c.kw.hr, ...c.kw.en];
    list.push({ id: c.id, label: c.label, pts: c.pts, passed: kws.some((k) => hasKeyword(tx, k)), hint: c.hint });
  }
  const vague = [...r.vague.hr, ...r.vague.en];
  list.push({
    id: "vague",
    label: ["Bez preopćenitih riječi", "No overly generic words"],
    pts: r.vaguePts,
    passed: !vague.some((k) => hasKeyword(tx, k)),
    hint: ["Zamijenite općenite riječi („nešto”, „kreativno”) konkretnim zahtjevom.", "Replace generic words (“something”, “creative”) with a concrete request."],
  });
  const score = list.reduce((a, x) => a + (x.passed ? x.pts : 0), 0);
  return { correct: score >= r.pass, score, checklist: list };
}

export function gradeSync(ex: Exercise, a: CanonicalAnswer): GradeResult {
  if (a.type !== ex.type) return all(false);
  switch (ex.type) {
    case "mc":
    case "doctor":
    case "compare":
      return all((a as { index: number }).index === ex.answer);
    case "spot":
      return all((a as { index: number }).index === ex.bad);
    case "tf":
      return all((a as { value: boolean }).value === ex.answer);
    case "fill": {
      const accepted = [...ex.answers.hr, ...ex.answers.en].map(norm);
      return all(accepted.includes(norm((a as { text: string }).text)));
    }
    case "build": {
      const m = (a as { mapping: number[] }).mapping;
      return ratio(ex.parts.filter((_, i) => m[i] === i).length, ex.parts.length);
    }
    case "match": {
      const m = (a as { mapping: number[] }).mapping;
      return ratio(ex.pairs.filter((_, i) => m[i] === i).length, ex.pairs.length);
    }
    case "order": {
      const s = (a as { sequence: number[] }).sequence;
      return ratio(ex.steps.filter((_, i) => s[i] === i).length, ex.steps.length);
    }
    case "rubric":
      return gradeRubric(ex, (a as { text: string }).text);
  }
}

export const DeterministicGrader: Grader = {
  id: "deterministic",
  async grade(ex, a) {
    return gradeSync(ex, a);
  },
};
