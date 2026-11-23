"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { sfx } from "@/lib/client/sfx";
import type { ExerciseProps } from "./types";

export function Choice({ ex, reveal, onChange, pickRef }: ExerciseProps<"mc" | "tf" | "compare" | "doctor">) {
  const t = useTranslations("player");
  const [sel, setSel] = useState(-1);
  const locked = !!reveal;
  const choose = (i: number) => {
    if (locked || i < 0 || i >= ex.options.length) return;
    setSel(i);
    sfx("tap");
    onChange({ kind: "index", value: i });
  };
  useEffect(() => {
    if (pickRef) pickRef.current = choose;
  });
  return (
    <div>
      {ex.type === "doctor" && (
        <div className="badprompt">
          <small>{t("badPrompt")}</small>
          {ex.bad}
        </div>
      )}
      <div className="opts" role="radiogroup">
        {ex.options.map((o, i) => {
          const cls = reveal ? (i === reveal.correctIndex ? "right" : i === sel ? "wrong" : "") : i === sel ? "sel" : "";
          return (
            <button key={i} type="button" role="radio" aria-checked={i === sel} disabled={locked} className={`opt ${cls}`} onClick={() => choose(i)}>
              <span className="k" aria-hidden="true">{ex.letters ? String.fromCharCode(65 + i) : i + 1}</span>
              <span className="t">{o}</span>
              {reveal?.whys?.[i] && <span className="why">{reveal.whys[i]}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
