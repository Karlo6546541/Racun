"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { emailSignIn, googleSignIn } from "@/server/actions";

export function SignInForms({ locale, google }: { locale: string; google: boolean }) {
  const t = useTranslations("signin");
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {google ? (
        <button className="btn btn-big btn-ghost" disabled={pending} onClick={() => start(() => googleSignIn(locale))}>
          <span aria-hidden="true">G</span> {t("google")}
        </button>
      ) : (
        <p className="muted" style={{ fontSize: 14 }}>
          {t("googleOff")}
        </p>
      )}
      <form
        className="card"
        style={{ display: "grid", gap: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          start(() => emailSignIn(email, locale));
        }}
      >
        <label htmlFor="email" style={{ fontWeight: 800 }}>
          {t("email")}
        </label>
        <input id="email" type="email" required className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailPh")} autoComplete="email" />
        <button className="btn" disabled={pending}>
          {t("sendLink")}
        </button>
      </form>
    </div>
  );
}
