"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { sfx } from "@/lib/client/sfx";
import type { ExerciseProps } from "./types";

export function Order({ ex, reveal, onChange }: ExerciseProps<"order">) {
  const t = useTranslations("player");
  const [seq, setSeq] = useState<number[]>([]);
  const locked = !!reveal;
  const update = (next: number[]) => {
    setSeq(next);
    onChange(next.length === ex.chips.length ? { kind: "list", value: next } : null);
  };
  return (
    <div>
      <ol className="seq">
        {seq.length === 0 && <li className="ph">{t("orderHint")}</li>}
        {seq.map((c, i) => (
          <li key={c}>
            <button type="button" disabled={locked} className={`step ${reveal?.marks ? (reveal.marks[i] ? "ok" : "bad") : ""}`} onClick={() => update(seq.filter((_, k) => k !== i))}>
              <b>{i + 1}</b>
              {ex.chips[c]}
            </button>
          </li>
        ))}
      </ol>
      {reveal && !reveal.correct && reveal.solution && (
        <div className="fix">
          {reveal.solution.map((s, i) => (
            <div key={i}>
              {i + 1}. {s}
            </div>
          ))}
        </div>
      )}
      <div className="pool" style={{ marginTop: 12 }}>
        {ex.chips.map((chip, c) =>
          seq.includes(c) ? null : (
            <button
              key={c}
              type="button"
              className="chip"
              disabled={locked}
              onClick={() => {
                sfx("tap");
                update([...seq, c]);
              }}
            >
              {chip}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
