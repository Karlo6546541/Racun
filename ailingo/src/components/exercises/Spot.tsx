"use client";
import { useEffect, useState } from "react";
import { sfx } from "@/lib/client/sfx";
import type { ExerciseProps } from "./types";

export function Spot({ ex, reveal, onChange, pickRef }: ExerciseProps<"spot">) {
  const [sel, setSel] = useState(-1);
  const choose = (i: number) => {
    if (reveal || i < 0 || i >= ex.segments.length) return;
    setSel(i);
    sfx("tap");
    onChange({ kind: "index", value: i });
  };
  useEffect(() => {
    if (pickRef) pickRef.current = choose;
  });
  return (
    <p className="spot">
      {ex.segments.map((s, i) => {
        const cls = reveal ? (i === reveal.badIndex ? "fake" : i === sel ? "miss" : "") : i === sel ? "sel" : "";
        return (
          <button key={i} type="button" className={`seg ${cls}`} disabled={!!reveal} aria-pressed={i === sel} onClick={() => choose(i)}>
            {s}
          </button>
        );
      })}
    </p>
  );
}
