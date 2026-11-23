import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/server/viewer";
import { freeDailyMinutes } from "@/server/config";
import { prisma } from "@/server/db";
import { visibleStreak } from "@/lib/game/streak";
import { dayKey } from "@/lib/time";
import { Player } from "@/components/player/Player";

type Search = { mode?: string; lesson?: string; practice?: string };

export default async function Play({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Search> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const user = await getViewer();
  if (!user?.onboarded && sp.mode !== "PLACEMENT") redirect({ href: user ? "/onboarding" : "/", locale });
  if (!user) redirect({ href: "/", locale });
  const mode = (["LESSON", "PRACTICE", "BLITZ", "PLACEMENT"] as const).find((m) => m === sp.mode) ?? "LESSON";
  const s = await prisma.streak.findUnique({ where: { userId: user!.id } });
  const streak = visibleStreak({ current: s?.current ?? 0, longest: s?.longest ?? 0, lastActiveDay: s?.lastActiveDay ?? null }, dayKey(new Date(), user!.timezone), user!.streakFreezes);
  return (
    <main>
      <Player
        key={`${mode}:${sp.lesson ?? ""}:${sp.practice ?? ""}`}
        mode={mode}
        lessonId={sp.lesson}
        practice={sp.practice === "free" ? "free" : sp.practice === "review" ? "review" : undefined}
        sound={user!.soundOn}
        tz={user!.timezone}
        freeMinutes={await freeDailyMinutes()}
        streak={streak}
      />
    </main>
  );
}
