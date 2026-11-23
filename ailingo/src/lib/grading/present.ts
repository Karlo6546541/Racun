import { createHmac } from "node:crypto";
import { z } from "zod";
import type { Exercise, Txt } from "../content/schema";
import type { CanonicalAnswer, GradeResult } from "./types";

export type Lang = "hr" | "en";
const pick = (t: Txt, lang: Lang) => t[lang === "en" ? 1 : 0];

/** What the browser receives: localized, shuffled, and with no answers in it. */
export type ClientExercise = { id: string; q: string } & (
  | { type: "mc" | "compare" | "tf"; options: string[]; letters: boolean }
  | { type: "doctor"; bad: string; options: string[]; letters: true }
  | { type: "fill" }
  | { type: "build"; slots: string[]; chips: string[] }
  | { type: "match"; left: string[]; right: string[] }
  | { type: "order"; chips: string[] }
  | { type: "spot"; segments: string[] }
  | { type: "rubric"; minWords: number }
);

/** Answer as sent by the browser, in displayed index space. */
export const ClientAnswerSchema = z.union([
  z.object({ kind: z.literal("index"), value: z.number().int().min(0).max(10) }),
  z.object({ kind: z.literal("text"), value: z.string().max(2000) }),
  z.object({ kind: z.literal("list"), value: z.array(z.number().int().min(0).max(10)).max(10) }),
]);
export type ClientAnswer = z.infer<typeof ClientAnswerSchema>;

/** Deterministic, secret-keyed permutation: the client cannot predict where the right answer sits. */
export function permutation(n: number, secret: string, sessionId: string, exerciseId: string): number[] {
  const h = createHmac("sha256", secret).update(`${sessionId}:${exerciseId}`).digest();
  let s = h.readUInt32LE(0);
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (n > 2 && a.every((v, i) => v === i)) a.push(a.shift()!);
  return a;
}

function permSize(ex: Exercise): number {
  switch (ex.type) {
    case "mc":
    case "doctor":
      return ex.options.length;
    case "compare":
      return 2;
    case "build":
      return ex.parts.length;
    case "match":
      return ex.pairs.length;
    case "order":
      return ex.steps.length;
    default:
      return 1;
  }
}

export type Ctx = { secret: string; sessionId: string; lang: Lang };
const permFor = (ex: Exercise, c: Ctx) => permutation(permSize(ex), c.secret, c.sessionId, ex.id);

export function toClient(ex: Exercise, c: Ctx): ClientExercise {
  const L = (t: Txt) => pick(t, c.lang);
  const p = permFor(ex, c);
  const base = { id: ex.id, q: L(ex.q) };
  switch (ex.type) {
    case "mc":
      return { ...base, type: "mc", options: p.map((i) => L(ex.options[i])), letters: false };
    case "doctor":
      return { ...base, type: "doctor", bad: L(ex.bad), options: p.map((i) => L(ex.options[i].t)), letters: true };
    case "compare":
      return { ...base, type: "compare", options: p.map((i) => L(i === 0 ? ex.a : ex.b)), letters: true };
    case "tf":
      return { ...base, type: "tf", options: c.lang === "en" ? ["True", "False"] : ["Točno", "Netočno"], letters: false };
    case "fill":
      return { ...base, type: "fill" };
    case "build":
      return { ...base, type: "build", slots: ex.slots.map(L), chips: p.map((i) => L(ex.parts[i])) };
    case "match":
      return { ...base, type: "match", left: ex.pairs.map((x) => L(x[0])), right: p.map((i) => L(ex.pairs[i][1])) };
    case "order":
      return { ...base, type: "order", chips: p.map((i) => L(ex.steps[i])) };
    case "spot":
      return { ...base, type: "spot", segments: ex.segments.map((s) => L(s).trim()) };
    case "rubric":
      return { ...base, type: "rubric", minWords: ex.rubric.minWords };
  }
}

const inRange = (v: number[], n: number) => v.length === n && v.every((x) => x >= 0 && x < n);

/** Maps a displayed-space answer to canonical space. Returns null when the shape is invalid. */
export function toCanonical(ex: Exercise, a: ClientAnswer, c: Ctx): CanonicalAnswer | null {
  const p = permFor(ex, c);
  switch (ex.type) {
    case "mc":
    case "doctor":
    case "compare":
      return a.kind === "index" && a.value < p.length ? { type: ex.type, index: p[a.value] } : null;
    case "tf":
      return a.kind === "index" && a.value < 2 ? { type: "tf", value: a.value === 0 } : null;
    case "spot":
      return a.kind === "index" && a.value < ex.segments.length ? { type: "spot", index: a.value } : null;
    case "fill":
    case "rubric":
      return a.kind === "text" && a.value.trim() ? { type: ex.type, text: a.value } : null;
    case "build":
    case "match":
      return a.kind === "list" && inRange(a.value, p.length) && new Set(a.value).size === p.length
        ? { type: ex.type, mapping: a.value.map((d) => p[d]) }
        : null;
    case "order":
      return a.kind === "list" && inRange(a.value, p.length) && new Set(a.value).size === p.length
        ? { type: "order", sequence: a.value.map((d) => p[d]) }
        : null;
  }
}

/** Data the browser needs to show feedback, sent only after grading. */
export type Reveal = {
  correct: boolean;
  score: number;
  explanation: string;
  correctIndex?: number;
  whys?: string[];
  accepted?: string[];
  solution?: string[];
  marks?: boolean[];
  badIndex?: number;
  checklist?: { id: string; label: string; pts: number; passed: boolean; hint: string }[];
  model?: string;
};

export function reveal(ex: Exercise, canonical: CanonicalAnswer, g: GradeResult, c: Ctx): Reveal {
  const L = (t: Txt) => pick(t, c.lang);
  const p = permFor(ex, c);
  const r: Reveal = { correct: g.correct, score: g.score, explanation: L(ex.explain) };
  switch (ex.type) {
    case "mc":
    case "compare":
      r.correctIndex = p.indexOf(ex.answer);
      break;
    case "doctor":
      r.correctIndex = p.indexOf(ex.answer);
      r.whys = p.map((i) => L(ex.options[i].why));
      break;
    case "tf":
      r.correctIndex = ex.answer ? 0 : 1;
      break;
    case "spot":
      r.badIndex = ex.bad;
      break;
    case "fill":
      r.accepted = ex.answers[c.lang].slice(0, 3);
      break;
    case "build":
      r.solution = ex.parts.map(L);
      r.marks = canonical.type === "build" ? ex.parts.map((_, i) => canonical.mapping[i] === i) : [];
      break;
    case "match":
      r.solution = ex.pairs.map((x) => `${L(x[0])} → ${L(x[1])}`);
      r.marks = canonical.type === "match" ? ex.pairs.map((_, i) => canonical.mapping[i] === i) : [];
      break;
    case "order":
      r.solution = ex.steps.map(L);
      r.marks = canonical.type === "order" ? ex.steps.map((_, i) => canonical.sequence[i] === i) : [];
      break;
    case "rubric":
      r.checklist = (g.checklist ?? []).map((x) => ({ id: x.id, label: L(x.label), pts: x.pts, passed: x.passed, hint: L(x.hint) }));
      r.model = L(ex.rubric.model);
      break;
  }
  return r;
}
