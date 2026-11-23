import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireViewer } from "@/server/viewer";
import { prisma } from "@/server/db";
import { aiGraderEnabled } from "@/lib/grading";
import { pushEnabled } from "@/server/push";
import { Settings } from "@/components/Settings";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireViewer();
  const t = await getTranslations("settings");
  const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
  return (
    <main>
      <h2 style={{ margin: "4px 0 12px" }}>{t("title")}</h2>
      <Settings
        locale={locale}
        user={{ name: user.name ?? "", soundOn: user.soundOn, dailyGoalMin: user.dailyGoalMin, hideFromLeaderboards: user.hideFromLeaderboards, gems: user.gems, hearts: user.hearts, freezes: user.streakFreezes, isGuest: user.isGuest }}
        hasSubscription={!!sub?.stripeSubscriptionId}
        aiFlag={aiGraderEnabled() ? "ON" : "OFF"}
        vapidKey={pushEnabled() ? process.env.VAPID_PUBLIC_KEY! : null}
      />
    </main>
  );
}
