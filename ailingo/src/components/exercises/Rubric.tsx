"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ExerciseProps } from "./types";

export function Rubric({ ex, reveal, onChange, submit }: ExerciseProps<"rubric">) {
  const t = useTranslations("player");
  const [text, setText] = useState("");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return (
    <div>
      <div className="note" role="note">
        ℹ️ {t("rubricNote")}
      </div>
      <textarea
        className="rb"
        rows={6}
        maxLength={2000}
        disabled={!!reveal}
        aria-label={t("yourPrompt")}
        placeholder={t("rubricPh")}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const w = e.target.value.trim().split(/\s+/).filter(Boolean).length;
          onChange(w >= 3 ? { kind: "text", value: e.target.value } : null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit?.();
          }
        }}
      />
      <p className="hint">{t("words", { n: words, min: ex.minWords })}</p>
      {reveal?.checklist && (
        <div>
          <div style={{ fontSize: 30, fontWeight: 900, margin: "8px 0 2px" }}>
            {reveal.score}
            <small className="muted" style={{ fontSize: 16 }}>
              /100
            </small>
          </div>
          <div className={`prog ${reveal.correct ? "" : "gold"}`}>
            <i style={{ width: `${reveal.score}%` }} />
          </div>
          <ul className="check">
            {reveal.checklist.map((c) => (
              <li key={c.id} className={c.passed ? "ok" : "bad"}>
                <span aria-hidden="true">{c.passed ? "✔" : "✖"}</span>
                <span>
                  {c.label}
                  <span className="sr-only"> {c.passed ? t("met") : t("notMet")}</span>
                </span>
                <em>{(c.passed ? "+" : "") + c.pts}</em>
                {!c.passed && <small>💡 {c.hint}</small>}
              </li>
            ))}
          </ul>
          <div className="model">
            <small>{t("model")}</small>
            {reveal.model}
          </div>
        </div>
      )}
    </div>
  );
}
