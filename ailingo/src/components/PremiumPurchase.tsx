"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/client/api";
import { PremiumButtons } from "./PremiumButtons";

type DGItem = { itemId: string; price: { currency: string; value: string } };
type DGPurchase = { itemId: string; purchaseToken: string };
type DGService = { getDetails(ids: string[]): Promise<DGItem[]>; listPurchases(): Promise<DGPurchase[]> };
declare global {
  interface Window {
    getDigitalGoodsService?: (method: string) => Promise<DGService>;
  }
}
const PLAY = "https://play.google.com/billing";

type Props = {
  locale: string;
  signedIn: boolean;
  active: boolean;
  provider: string | null;
  hasStripeCustomer: boolean;
  stripeReady: boolean;
  labels: { monthly: string; yearly: string };
  trialDays: number;
  play: { monthly: string; yearly: string; packageName: string; productId: string | null };
};

/** Inside the Android app (Trusted Web Activity) Premium is sold only through Google Play Billing; on the web through Stripe. */
export function PremiumPurchase(p: Props) {
  const t = useTranslations("premium");
  const router = useRouter();
  const [mode, setMode] = useState<"loading" | "play" | "web">("loading");
  const [service, setService] = useState<DGService | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      if (typeof window.getDigitalGoodsService !== "function") return setMode("web");
      try {
        const s = await window.getDigitalGoodsService(PLAY);
        setService(s);
        setMode("play");
        const items = await s.getDetails([p.play.monthly, p.play.yearly]);
        const fmt = (i: DGItem) => new Intl.NumberFormat(p.locale === "en" ? "en" : "hr", { style: "currency", currency: i.price.currency }).format(Number(i.price.value));
        setPrices(Object.fromEntries(items.map((i) => [i.itemId, fmt(i)])));
        // Restore: purchases made earlier (e.g. before reinstalling) are re-verified by the server.
        if (p.signedIn && !p.active) {
          const owned = await s.listPurchases();
          let restored = false;
          for (const o of owned) restored = (await api("/api/billing/play/verify", { purchaseToken: o.purchaseToken })).ok || restored;
          if (restored) router.refresh();
        }
      } catch {
        setMode("play");
      }
    })();
  }, [p.play.monthly, p.play.yearly, p.locale, p.signedIn, p.active, router]);

  const buyOnPlay = async (sku: string) => {
    if (!service) return setMsg(t("playUnavailable"));
    setBusy(true);
    setMsg("");
    try {
      const req = new PaymentRequest([{ supportedMethods: PLAY, data: { sku } }], { total: { label: "AIlingo Premium", amount: { currency: "EUR", value: "0" } } });
      const res = await req.show();
      const token = (res.details as { purchaseToken?: string }).purchaseToken;
      const r = token ? await api("/api/billing/play/verify", { purchaseToken: token }) : { ok: false as const };
      await res.complete(r.ok ? "success" : "fail");
      if (r.ok) router.push("/premium?status=success");
      else setMsg(t("playError"));
    } catch {
      setMsg(t("cancel"));
    } finally {
      setBusy(false);
    }
  };

  if (mode === "loading") return <p className="muted">…</p>;

  if (p.active) {
    if (p.provider === "play")
      return (
        <a className="btn btn-big btn-ghost" href={`https://play.google.com/store/account/subscriptions?package=${p.play.packageName}${p.play.productId ? "&sku=" + p.play.productId : ""}`} target="_blank" rel="noreferrer">
          {t("playManage")}
        </a>
      );
    if (p.hasStripeCustomer) return mode === "web" ? <PremiumButtons locale={p.locale} mode="portal" label={t("manage")} /> : <p className="muted">{t("manageOnWeb")}</p>;
    return null;
  }

  if (!p.signedIn)
    return (
      <Link href="/signin" className="btn btn-big">
        {t("signinFirst")}
      </Link>
    );

  if (mode === "play")
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <button className="btn btn-big" disabled={busy} onClick={() => buyOnPlay(p.play.monthly)} data-testid="play-monthly">
          {t("monthly")}
          {prices[p.play.monthly] ? ` · ${t("perMonth", { price: prices[p.play.monthly] })}` : ""}
        </button>
        <button className="btn btn-big btn-blue" disabled={busy} onClick={() => buyOnPlay(p.play.yearly)} data-testid="play-yearly">
          {t("yearly")}
          {prices[p.play.yearly] ? ` · ${t("perYear", { price: prices[p.play.yearly] })}` : ""}
        </button>
        <p className="muted" style={{ fontSize: 14, margin: 0 }}>
          {t("playNote")}
        </p>
        {msg && <p role="alert">{msg}</p>}
      </div>
    );

  if (!p.stripeReady) return <p className="muted">{t("notConfigured")}</p>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <PremiumButtons locale={p.locale} mode="monthly" label={`${t("monthly")} · ${t("perMonth", { price: p.labels.monthly })}`} />
      <PremiumButtons locale={p.locale} mode="yearly" label={`${t("yearly")} · ${t("perYear", { price: p.labels.yearly })}`} />
      {p.trialDays > 0 && <p className="muted" style={{ fontSize: 14, margin: 0 }}>{t("trial", { days: p.trialDays })}</p>}
    </div>
  );
}
