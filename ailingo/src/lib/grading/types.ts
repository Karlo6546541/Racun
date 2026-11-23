import type { Exercise, Txt } from "../content/schema";

/** Answers in canonical (original content) index space. */
export type CanonicalAnswer =
  | { type: "mc" | "doctor" | "compare" | "spot"; index: number }
  | { type: "tf"; value: boolean }
  | { type: "fill" | "rubric"; text: string }
  | { type: "build" | "match"; mapping: number[] }
  | { type: "order"; sequence: number[] };

export type ChecklistItem = { id: string; label: Txt; pts: number; passed: boolean; hint: Txt };

export type GradeResult = {
  correct: boolean;
  /** 0..100 */
  score: number;
  checklist?: ChecklistItem[];
};

export interface Grader {
  readonly id: "deterministic" | "ai";
  grade(exercise: Exercise, answer: CanonicalAnswer): Promise<GradeResult>;
}
