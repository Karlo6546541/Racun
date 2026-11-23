import type { ReactNode } from "react";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/server/viewer";
import { homeData } from "@/server/home";
import { clientIp } from "@/server/ratelimit";
import { BottomNav } from "@/components/BottomNav";
import { Link } from "@/i18n/navigation";

export default async function AppLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const viewer = await getViewer();
  if (!viewer?.onboarded) redirect({ href: viewer ? "/onboarding" : "/", locale });
  const d = await homeData(viewer!, clientIp(await headers()));
  const t = await getTranslations("common");
  const tp = await getTranslations("paywall");
  const remaining = d.usage.remainingSeconds;
  return (
    <div className="wrap" style={{ paddingBottom: 96 }}>
      <header className="top">
        <div style={{ display: "flex", gap: 6 }}>
          <span className="pill" title={t("streak")}>
            🔥 {d.streak}
          </span>
          <span className="pill" title={t("hearts")}>
            ❤️ {d.hearts}
          </span>
          <span className="pill" title={t("gems")}>
            💎 {d.user.gems}
          </span>
        </div>
        <Link href="/premium" className="pill" style={{ textDecoration: "none", color: "inherit" }} data-testid="usage-pill">
          {d.usage.premium ? "⭐ Premium" : `⏱ ${Math.ceil((remaining ?? 0) / 60)}/${Math.round(d.usage.limitSeconds / 60)} min`}
        </Link>
      </header>
      <span className="sr-only">{d.usage.premium ? tp("unlimited") : tp("meter", { time: `${Math.ceil((remaining ?? 0) / 60)} min` })}</span>
      {children}
      <BottomNav />
    </div>
  );
}
