"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";

export function PremiumButtons({ locale, mode, label }: { locale: string; mode: "monthly" | "yearly" | "portal"; label: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const go = async () => {
    setBusy(true);
    const r = mode === "portal" ? await api<{ url: string }>("/api/stripe/portal", { locale }) : await api<{ url: string }>("/api/stripe/checkout", { plan: mode, locale });
    if (r.ok) window.location.href = r.data.url;
    else {
      setErr(true);
      setBusy(false);
    }
  };
  return (
    <>
      <button className={`btn btn-big ${mode === "yearly" ? "btn-blue" : mode === "portal" ? "btn-ghost" : ""}`} disabled={busy} onClick={go}>
        {label}
      </button>
      {err && <p role="alert">⚠️</p>}
    </>
  );
}
