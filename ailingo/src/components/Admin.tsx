"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ClientExercise } from "@/lib/grading/present";
import { adminClearFlag, adminGrantPremium, adminSaveExercise, adminSetFreeMinutes } from "@/server/actions";
import { ExerciseView } from "./exercises";

export function AdminConfig({ minutes, label }: { minutes: number; label: string }) {
  const [v, setV] = useState(String(minutes));
  const [msg, setMsg] = useState("");
  const [p, start] = useTransition();
  return (
    <form style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }} onSubmit={(e) => (e.preventDefault(), start(async () => setMsg((await adminSetFreeMinutes(Number(v))).ok ? "✓" : "✗")))}>
      <label htmlFor="fm" style={{ fontWeight: 800 }}>
        {label}
      </label>
      <input id="fm" className="field" style={{ width: 90 }} type="number" min={0} max={1440} value={v} onChange={(e) => setV(e.target.value)} />
      <button className="btn btn-sm" disabled={p}>
        ✓
      </button>
      <span role="status">{msg}</span>
    </form>
  );
}

export function AdminGrant({ label }: { label: string }) {
  const [email, setEmail] = useState("");
  const [days, setDays] = useState("30");
  const [msg, setMsg] = useState("");
  const [p, start] = useTransition();
  return (
    <form style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }} onSubmit={(e) => (e.preventDefault(), start(async () => setMsg((await adminGrantPremium(email, Number(days))).ok ? "✓" : "✗")))}>
      <span style={{ fontWeight: 800 }}>{label}</span>
      <input className="field" style={{ flex: 2, minWidth: 160 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="email" />
      <input className="field" style={{ width: 90 }} type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} aria-label="days" />
      <button className="btn btn-sm" disabled={p}>
        ✓
      </button>
      <span role="status">{msg}</span>
    </form>
  );
}

export function AdminClearFlag({ id }: { id: string }) {
  const [p, start] = useTransition();
  return (
    <button className="btn btn-sm btn-ghost" disabled={p} onClick={() => start(async () => void (await adminClearFlag(id)))}>
      ✓
    </button>
  );
}

export function AdminEditor({ id, initial, preview, previewLabel }: { id: string; initial: string; preview: ClientExercise; previewLabel: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [json, setJson] = useState(initial);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [ok, setOk] = useState(false);
  const [p, start] = useTransition();
  return (
    <div>
      <textarea className="rb" style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }} rows={22} value={json} onChange={(e) => (setJson(e.target.value), setOk(false))} aria-label="JSON" spellCheck={false} />
      <button
        className="btn"
        style={{ marginTop: 10 }}
        disabled={p}
        onClick={() =>
          start(async () => {
            const r = await adminSaveExercise(id, json);
            setErrors(r.errors ?? null);
            setOk(r.ok);
          })
        }
      >
        {tc("save")}
      </button>
      <p role="status">{ok ? `✓ ${t("valid")} · ${tc("saved")}` : ""}</p>
      {errors && (
        <div className="note" role="alert">
          ✗ {t("invalid")}
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <h3 style={{ marginTop: 20 }}>{previewLabel}</h3>
      <div className="card">
        <h2 className="qtext">{preview.q}</h2>
        <ExerciseView ex={preview} reveal={null} onChange={() => {}} />
      </div>
    </div>
  );
}
