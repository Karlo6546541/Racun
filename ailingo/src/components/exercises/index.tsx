"use client";
import type { ExerciseProps } from "./types";
import { Choice } from "./Choice";
import { Fill } from "./Fill";
import { Build } from "./Build";
import { Match } from "./Match";
import { Order } from "./Order";
import { Spot } from "./Spot";
import { Rubric } from "./Rubric";

export function ExerciseView(props: ExerciseProps) {
  const { ex } = props;
  switch (ex.type) {
    case "mc":
    case "tf":
    case "compare":
    case "doctor":
      return <Choice {...(props as ExerciseProps<"mc" | "tf" | "compare" | "doctor">)} />;
    case "fill":
      return <Fill {...(props as ExerciseProps<"fill">)} />;
    case "build":
      return <Build {...(props as ExerciseProps<"build">)} />;
    case "match":
      return <Match {...(props as ExerciseProps<"match">)} />;
    case "order":
      return <Order {...(props as ExerciseProps<"order">)} />;
    case "spot":
      return <Spot {...(props as ExerciseProps<"spot">)} />;
    case "rubric":
      return <Rubric {...(props as ExerciseProps<"rubric">)} />;
  }
}
