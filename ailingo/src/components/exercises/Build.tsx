"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { sfx } from "@/lib/client/sfx";
import type { ExerciseProps } from "./types";

/** Tap a part then a slot (or tap a part to fill the next empty slot), or drag it. Fully keyboard accessible. */
export function Build({ ex, reveal, onChange }: ExerciseProps<"build">) {
  const t = useTranslations("player");
  const n = ex.slots.length;
  const [placed, setPlaced] = useState<number[]>(() => Array(n).fill(-1));
  const [active, setActive] = useState(-1);
  const locked = !!reveal;
  const update = (next: number[]) => {
    setPlaced(next);
    onChange(next.every((x) => x >= 0) ? { kind: "list", value: next } : null);
  };
  const put = (chip: number, slot: number) => {
    if (locked) return;
    const target = slot >= 0 && placed[slot] < 0 ? slot : placed.indexOf(-1);
    if (target < 0) return;
    const next = placed.slice();
    next[target] = chip;
    setActive(-1);
    sfx("tap");
    update(next);
  };
  return (
    <div>
      <div className="slots">
        {ex.slots.map((label, i) => {
          const c = placed[i];
          const mark = reveal?.marks ? (reveal.marks[i] ? "ok" : "bad") : "";
          return (
            <div key={i}>
              <button
                type="button"
                disabled={locked}
                className={`slot ${c >= 0 ? "full" : ""} ${active === i ? "act" : ""} ${mark}`}
                aria-label={`${label}: ${c >= 0 ? ex.chips[c] : t("empty")}`}
                onClick={() => {
                  if (c >= 0) {
                    const next = placed.slice();
                    next[i] = -1;
                    setActive(i);
                    update(next);
                  } else setActive(active === i ? -1 : i);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const chip = Number(e.dataTransfer.getData("text/plain"));
                  if (Number.isInteger(chip)) {
                    const next = placed.slice();
                    if (next[i] >= 0) next[i] = -1;
                    const target = i;
                    next[target] = chip;
                    sfx("tap");
                    update(next);
                  }
                }}
              >
                <span className="sl">{label}</span>
                <span className="sv">{c >= 0 ? ex.chips[c] : "…"}</span>
              </button>
              {reveal?.marks && !reveal.marks[i] && reveal.solution && <div className="fix">✔ {reveal.solution[i]}</div>}
            </div>
          );
        })}
      </div>
      <div className="pool" aria-label={t("parts")}>
        {ex.chips.map((chip, c) =>
          placed.includes(c) ? null : (
            <button key={c} type="button" className="chip" draggable={!locked} disabled={locked} onDragStart={(e) => e.dataTransfer.setData("text/plain", String(c))} onClick={() => put(c, active)}>
              {chip}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
