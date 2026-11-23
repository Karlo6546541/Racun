import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getViewer } from "@/server/viewer";
import { prisma } from "@/server/db";
import { getConfig } from "@/server/config";
import { stripeEnabled } from "@/server/billing";
import { isPremium } from "@/lib/game/entitlement";
import { Mascot } from "@/components/Mascot";
import { PremiumPurchase } from "@/components/PremiumPurchase";
import { playConfig } from "@/server/playbilling";
import { LegalFooter } from "@/components/LegalFooter";

export default async function Premium({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ status?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const status = (await searchParams).status;
  const t = await getTranslations("premium");
  const f = await getFormatter();
  const user = await getViewer();
  const sub = user ? await prisma.subscription.findUnique({ where: { userId: user.id } }) : null;
  const active = user ? isPremium(sub, user.premiumUntil) : false;
  const cfg = await getConfig();
  const trialDays = Number(process.env.STRIPE_TRIAL_DAYS || 0);
  const date = (d: Date | null | undefined) => (d ? f.dateTime(d, { dateStyle: "medium" }) : "");
  return (
    <main className="wrap" style={{ paddingTop: 20, paddingBottom: 40 }}>
      <Link href="/learn" className="muted">
        ← AIlingo
      </Link>
      <div style={{ textAlign: "center", margin: "10px 0" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Mascot mood="cheer" size={96} />
        </div>
        <h1 style={{ fontSize: 30 }}>{t("title")}</h1>
        <p className="muted">{t("lead")}</p>
      </div>
      {status === "success" && <div className="note">{t("success")}</div>}
      {status === "cancel" && <div className="note">{t("cancel")}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <section className="card" style={{ margin: 0 }}>
          <h3>{t("free")}</h3>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {t("freeList").split("|").map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
        <section className="card" style={{ margin: 0, borderColor: "var(--gold)" }}>
          <h3>⭐ {t("plus")}</h3>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {t("plusList").split("|").map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      </div>
      <section className="card" style={{ marginTop: 14 }}>
        {active ? (
          <>
            <h3>⭐ {t("active")}</h3>
            <p className="muted">
              {sub?.status === "trialing" && sub.trialEnd
                ? t("trialUntil", { date: date(sub.trialEnd) })
                : sub?.cancelAtPeriodEnd
                  ? t("cancelAtEnd", { date: date(sub.currentPeriodEnd) })
                  : sub?.currentPeriodEnd
                    ? t("until", { date: date(sub.currentPeriodEnd) })
                    : user?.premiumUntil
                      ? t("until", { date: date(user.premiumUntil) })
                      : ""}
            </p>
          </>
        ) : null}
        <PremiumPurchase
          locale={locale}
          signedIn={!!user && !user.isGuest}
          active={active}
          provider={sub?.provider ?? null}
          hasStripeCustomer={!!sub?.stripeSubscriptionId}
          stripeReady={stripeEnabled()}
          labels={{ monthly: cfg.PRICE_MONTHLY_LABEL, yearly: cfg.PRICE_YEARLY_LABEL }}
          trialDays={trialDays}
          play={{ ...playConfig(), productId: sub?.playProductId ?? null }}
        />
      </section>
      <p className="muted" style={{ fontSize: 12 }}>
        {t("legal")}
      </p>
      <LegalFooter />
    </main>
  );
}
