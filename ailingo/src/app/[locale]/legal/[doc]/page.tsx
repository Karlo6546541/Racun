import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LEGAL } from "@/lib/legal";

export default async function Legal({ params }: { params: Promise<{ locale: string; doc: string }> }) {
  const { locale, doc } = await params;
  setRequestLocale(locale);
  const d = LEGAL[doc as keyof typeof LEGAL];
  if (!d) notFound();
  const t = await getTranslations("legal");
  const L = (x: [string, string]) => x[locale === "en" ? 1 : 0];
  return (
    <main className="wrap" style={{ paddingTop: 20, paddingBottom: 40, maxWidth: 680 }}>
      <Link href="/">← AIlingo</Link>
      <h1 style={{ margin: "12px 0" }}>{t(doc as "terms")}</h1>
      <div className="note">⚖️ {t("draft")}</div>
      {d.map((s, i) => (
        <section key={i}>
          <h3 style={{ marginTop: 18 }}>{L(s.h)}</h3>
          <p>{L(s.p)}</p>
        </section>
      ))}
    </main>
  );
}
