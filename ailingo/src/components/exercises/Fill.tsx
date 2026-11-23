"use client";
import { useTranslations } from "next-intl";
import type { ExerciseProps } from "./types";

export function Fill({ reveal, onChange, submit }: ExerciseProps<"fill">) {
  const t = useTranslations("player");
  return (
    <div>
      <input
        className={`fill ${reveal ? (reveal.correct ? "right" : "wrong") : ""}`}
        type="text"
        autoFocus
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={!!reveal}
        aria-label={t("yourAnswer")}
        placeholder={t("fillPh")}
        maxLength={200}
        onChange={(e) => onChange(e.target.value.trim() ? { kind: "text", value: e.target.value } : null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit?.();
          }
        }}
      />
      <p className="hint">{t("fillHint")}</p>
      {reveal && !reveal.correct && reveal.accepted && <div className="fix">{t("accepted", { list: reveal.accepted.join(", ") })}</div>}
    </div>
  );
}
