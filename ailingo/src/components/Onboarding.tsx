"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { completeOnboarding } from "@/server/actions";
import { Mascot } from "./Mascot";
import { LangSwitch } from "./LangSwitch";
import { DAILY_GOAL_XP } from "@/lib/game/xp";

const GOALS = [["agency", "📣"], ["biz", "🏪"], ["free", "💻"], ["daily", "⚡"]] as const;
const LEVELS = [["beg", "🌱"], ["mid", "🌿"], ["adv", "🌳"]] as const;

export function Onboarding({ locale, defaultName }: { locale: string; defaultName: string }) {
  const t = useTranslations("onboarding");
  const tc = useTranslations("common");
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(defaultName);
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState("");
  const [daily, setDaily] = useState(10);
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");

  const finish = (placement: boolean) =>
    start(async () => {
      try {
        await completeOnboarding({ name, goal, level, daily, locale });
        router.push(placement ? "/play?mode=PLACEMENT" : "/learn");
      } catch {
        setErr(tc("error"));
      }
    });

  return (
    <div>
      <div style={{ display: "flex", gap: 6, margin: "6px 0 18px" }} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} style={{ flex: 1, height: 8, borderRadius: 99, background: i <= step ? "var(--green)" : "var(--line)" }} />
        ))}
      </div>
      {step === 0 && (
        <section>
          <h2>{t("nameQ")}</h2>
          <p className="muted">{t("nameHint")}</p>
          <input className="field" style={{ margin: "14px 0" }} maxLength={24} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePh")} aria-label={t("namePh")} />
          <LangSwitch locale={locale} />
          <button className="btn btn-big" style={{ marginTop: 20 }} onClick={() => setStep(1)}>
            {t("next")}
          </button>
        </section>
      )}
      {step === 1 && (
        <section>
          <h2>{t("goalQ")}</h2>
          <div style={{ display: "grid", gap: 10, margin: "14px 0" }}>
            {GOALS.map(([id, icon]) => (
              <button key={id} type="button" className="choice" aria-pressed={goal === id} onClick={() => setGoal(id)}>
                <span aria-hidden="true">{icon}</span>
                {t(`goal_${id}`)}
              </button>
            ))}
          </div>
          <button className="btn btn-big" disabled={!goal} onClick={() => setStep(2)}>
            {t("next")}
          </button>
        </section>
      )}
      {step === 2 && (
        <section>
          <h2>{t("levelQ")}</h2>
          <div style={{ display: "grid", gap: 10, margin: "14px 0" }}>
            {LEVELS.map(([id, icon]) => (
              <button key={id} type="button" className="choice" aria-pressed={level === id} onClick={() => setLevel(id)}>
                <span aria-hidden="true">{icon}</span>
                {t(`level_${id}`)}
              </button>
            ))}
          </div>
          <button className="btn btn-big" disabled={!level} onClick={() => setStep(3)}>
            {t("next")}
          </button>
        </section>
      )}
      {step === 3 && (
        <section>
          <h2>{t("dailyQ")}</h2>
          <div style={{ display: "grid", gap: 10, margin: "14px 0" }}>
            {[5, 10, 15, 20].map((m) => (
              <button key={m} type="button" className="choice" aria-pressed={daily === m} onClick={() => setDaily(m)}>
                <b>{tc("minutes", { n: m })}</b>
                <span className="muted">
                  {t(`daily_${m}`)} · {DAILY_GOAL_XP[m]} XP
                </span>
              </button>
            ))}
          </div>
          <button className="btn btn-big" onClick={() => setStep(4)}>
            {t("next")}
          </button>
        </section>
      )}
      {step === 4 && (
        <section style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Mascot mood="think" size={110} />
          </div>
          <h2>{t("placeQ")}</h2>
          <p className="muted">{t("placeHint")}</p>
          <button className="btn btn-big" disabled={pending} onClick={() => finish(true)}>
            {t("placeYes")}
          </button>
          <button className="btn btn-big btn-ghost" style={{ marginTop: 12 }} disabled={pending} onClick={() => finish(false)} data-testid="ob-done">
            {t("placeNo")}
          </button>
          {err && <p role="alert">{err}</p>}
        </section>
      )}
    </div>
  );
}
