"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { buyItem, deleteMyAccount, updateSettings } from "@/server/actions";
import { api } from "@/lib/client/api";
import { LangSwitch } from "./LangSwitch";

type U = { name: string; soundOn: boolean; dailyGoalMin: number; hideFromLeaderboards: boolean; gems: number; hearts: number; freezes: number; isGuest: boolean };

function b64ToUint8(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function Settings({ locale, user, hasSubscription, aiFlag, vapidKey }: { locale: string; user: U; hasSubscription: boolean; aiFlag: string; vapidKey: string | null }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(user.name);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState("");
  const save = (data: Parameters<typeof updateSettings>[0]) =>
    start(async () => {
      await updateSettings(data);
      setMsg(tc("saved"));
      router.refresh();
    });

  const enablePush = async () => {
    try {
      if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return setMsg(t("pushUnavailable"));
      const reg = await navigator.serviceWorker.ready;
      if ((await Notification.requestPermission()) !== "granted") return setMsg(t("pushUnavailable"));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vapidKey) });
      const r = await api("/api/push/subscribe", sub.toJSON());
      setMsg(r.ok ? t("pushOn") : tc("error"));
    } catch {
      setMsg(t("pushUnavailable"));
    }
  };

  return (
    <div>
      <section className="card">
        <h3>{t("language")}</h3>
        <LangSwitch locale={locale} persist />
      </section>
      <section className="card">
        <h3>{t("name")}</h3>
        <form
          style={{ display: "flex", gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            save({ name });
          }}
        >
          <input className="field" id="setname" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} aria-label={t("name")} />
          <button className="btn btn-sm" disabled={pending}>
            {tc("save")}
          </button>
        </form>
      </section>
      <section className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>{t("sound")}</h3>
        <button className={`btn btn-sm ${user.soundOn ? "" : "btn-ghost"}`} aria-pressed={user.soundOn} disabled={pending} onClick={() => save({ soundOn: !user.soundOn })}>
          {user.soundOn ? t("on") : t("off")}
        </button>
      </section>
      <section className="card">
        <h3>{t("dailyGoal")}</h3>
        <div className="seg2" role="group">
          {([5, 10, 15, 20] as const).map((m) => (
            <button key={m} type="button" aria-pressed={user.dailyGoalMin === m} disabled={pending} onClick={() => save({ dailyGoalMin: m })}>
              {tc("minutes", { n: m })}
            </button>
          ))}
        </div>
      </section>
      <section className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <h3>{t("hide")}</h3>
        <button className={`btn btn-sm ${user.hideFromLeaderboards ? "" : "btn-ghost"}`} aria-pressed={user.hideFromLeaderboards} disabled={pending} onClick={() => save({ hideFromLeaderboards: !user.hideFromLeaderboards })}>
          {user.hideFromLeaderboards ? t("on") : t("off")}
        </button>
      </section>
      <section className="card">
        <h3>💎 {t("shop")}</h3>
        <p className="muted">{user.gems} 💎</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button className="btn btn-sm btn-blue" disabled={pending || user.gems < 20 || user.freezes >= 2} onClick={() => start(async () => void (await buyItem("freeze"), router.refresh()))}>
            {t("freeze")}
          </button>
          <button className="btn btn-sm btn-blue" disabled={pending || user.gems < 10 || user.hearts >= 5} onClick={() => start(async () => void (await buyItem("hearts"), router.refresh()))}>
            {t("hearts")}
          </button>
        </div>
      </section>
      <section className="card">
        <h3>{t("subscription")}</h3>
        <Link href="/premium" className="btn btn-sm btn-ghost">
          {hasSubscription ? t("manage") : "Premium"}
        </Link>
      </section>
      <section className="card">
        <h3>{t("reminders")}</h3>
        <button className="btn btn-sm btn-ghost" onClick={enablePush} disabled={!vapidKey}>
          {vapidKey ? t("enablePush") : t("pushUnavailable")}
        </button>
      </section>
      <section className="card">
        <h3>{t("placement")}</h3>
        <Link href="/play?mode=PLACEMENT" className="btn btn-sm btn-ghost">
          {t("retake")}
        </Link>
      </section>
      <section className="card">
        <h3>{t("data")}</h3>
        <p className="muted" style={{ fontSize: 14 }}>
          {t("dataText")}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <a className="btn btn-sm btn-ghost" href="/api/me/export" download>
            {t("export")}
          </a>
          <button
            className={`btn btn-sm ${confirm ? "btn-red" : "btn-ghost"}`}
            style={confirm ? undefined : { color: "var(--red)" }}
            disabled={pending}
            onClick={() => {
              if (!confirm) return setConfirm(true);
              start(async () => {
                await deleteMyAccount();
                window.location.href = locale === "en" ? "/en" : "/";
              });
            }}
            data-testid="delete"
          >
            {confirm ? t("confirmDelete") : t("delete")}
          </button>
        </div>
      </section>
      <section className="card">
        <h3>{t("grading")}</h3>
        <p className="muted" style={{ fontSize: 14, margin: 0 }}>
          {t("gradingText", { flag: aiFlag })}
        </p>
      </section>
      {msg && (
        <p role="status" className="toast">
          {msg}
        </p>
      )}
    </div>
  );
}
