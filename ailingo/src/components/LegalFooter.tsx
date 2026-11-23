import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function LegalFooter() {
  const t = await getTranslations("legal");
  return (
    <footer className="muted" style={{ textAlign: "center", fontSize: 13, display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", margin: "18px 0" }}>
      <Link href="/legal/terms">{t("terms")}</Link>
      <Link href="/legal/privacy">{t("privacy")}</Link>
      <Link href="/legal/cookies">{t("cookies")}</Link>
    </footer>
  );
}
