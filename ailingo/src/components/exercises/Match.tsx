"use client";
import { useState } from "react";
import { sfx } from "@/lib/client/sfx";
import type { ExerciseProps } from "./types";

export function Match({ ex, reveal, onChange }: ExerciseProps<"match">) {
  const n = ex.left.length;
  const [pairs, setPairs] = useState<number[]>(() => Array(n).fill(-1));
  const [sel, setSel] = useState(-1);
  const locked = !!reveal;
  const update = (next: number[]) => {
    setPairs(next);
    onChange(next.every((x) => x >= 0) ? { kind: "list", value: next } : null);
  };
  return (
    <div>
      <div className="match">
        <div className="mcol">
          {ex.left.map((l, i) => (
            <button
              key={i}
              type="button"
              disabled={locked}
              aria-pressed={sel === i}
              className={`mi ${pairs[i] >= 0 ? "c" + (i % 5) : ""} ${sel === i ? "sel" : ""} ${reveal?.marks ? (reveal.marks[i] ? "ok" : "bad") : ""}`}
              onClick={() => {
                sfx("tap");
                if (pairs[i] >= 0) {
                  const next = pairs.slice();
                  next[i] = -1;
                  update(next);
                  setSel(-1);
                } else setSel(sel === i ? -1 : i);
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="mcol">
          {ex.right.map((r, j) => {
            const li = pairs.indexOf(j);
            return (
              <button
                key={j}
                type="button"
                disabled={locked}
                className={`mi ${li >= 0 ? "c" + (li % 5) : ""}`}
                onClick={() => {
                  sfx("tap");
                  const next = pairs.slice();
                  if (sel >= 0) {
                    if (li >= 0) next[li] = -1;
                    next[sel] = j;
                    setSel(-1);
                    update(next);
                  } else if (li >= 0) {
                    next[li] = -1;
                    update(next);
                  }
                }}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>
      {reveal && !reveal.correct && reveal.solution && (
        <div className="fix">
          {reveal.solution.map((s, i) => (
            <div key={i}>{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}
