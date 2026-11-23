import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { googleEnabled } from "@/auth";
import { Mascot } from "@/components/Mascot";
import { SignInForms } from "@/components/SignInForms";
import { LegalFooter } from "@/components/LegalFooter";

export default async function SignIn({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("signin");
  return (
    <main className="wrap" style={{ paddingTop: 20, paddingBottom: 40 }}>
      <Link href="/" className="muted">
        ← AIlingo
      </Link>
      <div style={{ textAlign: "center", margin: "10px 0 16px" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Mascot size={96} />
        </div>
        <h1 style={{ fontSize: 28 }}>{t("title")}</h1>
        <p className="muted">{t("lead")}</p>
      </div>
      {sp.sent && <div className="note">{t("sent")}</div>}
      {sp.error && <div className="note">{t("error")}</div>}
      <SignInForms locale={locale} google={googleEnabled} />
      <LegalFooter />
    </main>
  );
}
