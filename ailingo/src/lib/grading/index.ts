import { DeterministicGrader } from "./deterministic";
import type { Grader } from "./types";

/**
 * Optional AI grader slot. It is a stub on purpose: the app never calls any AI service.
 * Even with FEATURE_AI_GRADER=on it only throws, and callers fall back to the deterministic grader.
 */
export const AiGraderStub: Grader = {
  id: "ai",
  async grade() {
    throw new Error("AI grader is disabled. No external service is ever called.");
  },
};

export function aiGraderEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.FEATURE_AI_GRADER === "on";
}

export function getGrader(env: Record<string, string | undefined> = process.env): Grader {
  return aiGraderEnabled(env) ? AiGraderStub : DeterministicGrader;
}

export async function gradeWithFallback(...args: Parameters<Grader["grade"]>) {
  try {
    return await getGrader().grade(...args);
  } catch {
    return DeterministicGrader.grade(...args);
  }
}

export { DeterministicGrader };
export type { Grader, GradeResult, CanonicalAnswer, ChecklistItem } from "./types";
