import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { getViewer } from "@/server/viewer";
import { Mascot } from "@/components/Mascot";
import { LangSwitch } from "@/components/LangSwitch";
import { LegalFooter } from "@/components/LegalFooter";

export default async function Landing({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const viewer = await getViewer();
  if (viewer?.onboarded) redirect({ href: "/learn", locale });
  const t = await getTranslations("landing");
  const feats = [["🎮", "f1t", "f1"], ["🚀", "f2t", "f2"], ["⚖️", "f3t", "f3"], ["🔁", "f4t", "f4"]] as const;
  return (
    <main className="wrap" style={{ paddingTop: 14, paddingBottom: 40 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <LangSwitch locale={locale} />
      </div>
      <div style={{ textAlign: "center", padding: "24px 0 8px" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Mascot mood="cheer" size={120} />
        </div>
        <h1 style={{ fontSize: "clamp(32px,8vw,44px)", margin: "10px 0" }}>
          AI<span style={{ color: "var(--green)" }}>lingo</span>
        </h1>
        <p className="muted" style={{ fontSize: 17, maxWidth: "40ch", margin: "0 auto 18px" }}>
          {t("lead")}
        </p>
        <Link href="/onboarding" className="btn btn-big" data-testid="cta">
          {t("cta")}
        </Link>
        <Link href="/signin" className="btn btn-big btn-ghost" style={{ marginTop: 12 }}>
          {t("signin")}
        </Link>
      </div>
      <div style={{ display: "grid", gap: 10, margin: "22px 0" }}>
        {feats.map(([icon, a, b]) => (
          <div key={a} className="card" style={{ display: "flex", gap: 12, margin: 0 }}>
            <span style={{ fontSize: 26 }} aria-hidden="true">
              {icon}
            </span>
            <p style={{ margin: 0 }}>
              <b>{t(a)}</b>
              <br />
              <span className="muted" style={{ fontSize: 14 }}>
                {t(b)}
              </span>
            </p>
          </div>
        ))}
      </div>
      <p className="muted" style={{ textAlign: "center", fontSize: 14 }}>
        {t("free")} <Link href="/premium">{t("pricing")}</Link>
      </p>
      <LegalFooter />
    </main>
  );
}
