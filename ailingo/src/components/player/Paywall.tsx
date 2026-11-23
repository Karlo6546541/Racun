"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Mascot } from "../Mascot";
import { Countdown } from "./Countdown";

export function Paywall({ minutes, tz }: { minutes: number; tz: string }) {
  const t = useTranslations("paywall");
  return (
    <div className="sum" data-testid="paywall">
      <Mascot mood="happy" size={120} />
      <h1 style={{ fontSize: 26 }}>{t("title", { min: minutes })}</h1>
      <p className="muted">{t("text")}</p>
      <p style={{ fontSize: 34, fontWeight: 900, margin: "4px 0 8px" }}>
        <Countdown tz={tz} />
      </p>
      <p className="muted" style={{ fontSize: 14, maxWidth: "40ch" }}>
        {t("free")}
      </p>
      <Link href="/premium" className="btn btn-big" style={{ marginTop: 16 }}>
        {t("premium")}
      </Link>
      <Link href="/learn" className="btn btn-big btn-ghost" style={{ marginTop: 12 }}>
        {t("tomorrow")}
      </Link>
    </div>
  );
}
