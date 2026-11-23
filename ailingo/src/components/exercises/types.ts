import type { ClientAnswer, ClientExercise, Reveal } from "@/lib/grading/present";

export type ExerciseProps<T extends ClientExercise["type"] = ClientExercise["type"]> = {
  ex: Extract<ClientExercise, { type: T }>;
  reveal: Reveal | null;
  onChange: (a: ClientAnswer | null) => void;
  /** Lets the player pick option n with number keys. */
  pickRef?: { current: ((n: number) => void) | null };
  submit?: () => void;
};
