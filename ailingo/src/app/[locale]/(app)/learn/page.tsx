import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageViewer } from "@/server/viewer";
import { prisma } from "@/server/db";
import { getContent, lessonStates, trackLessons } from "@/server/content";
import { ensureQuests } from "@/server/game";
import { META } from "@/lib/content/meta";
import { DAILY_GOAL_XP } from "@/lib/game/xp";
import { dayKey } from "@/lib/time";
import { Tree, type TreeUnit } from "@/components/Tree";

export default async function Learn({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ track?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const track = (await searchParams).track === "mk" ? "mk" : "ai";
  const user = await pageViewer();
  const t = await getTranslations("learn");
  const L = (x: [string, string]) => x[locale === "en" ? 1 : 0];
  const { units } = await getContent();
  const progress = await prisma.progress.findMany({ where: { userId: user.id } });
  const done = new Set(progress.filter((p) => p.done).map((p) => p.lessonId));
  const stars = new Map(progress.map((p) => [p.lessonId, p.stars]));
  const states = lessonStates(units, done);
  const quests = await ensureQuests(prisma, user);
  const today = await prisma.xPEvent.aggregate({ where: { userId: user.id, dayKey: dayKey(new Date(), user.timezone) }, _sum: { amount: true } });
  const goal = DAILY_GOAL_XP[user.dailyGoalMin] ?? 100;
  const xpToday = today._sum.amount ?? 0;

  const treeUnits: TreeUnit[] = units
    .filter((u) => u.track === track)
    .map((u) => ({
      id: u.id,
      position: u.position,
      icon: u.icon,
      color: u.color,
      title: L(u.title),
      summary: L(u.summary),
      level: L(META.levels[u.level - 1]),
      lessons: u.lessons.map((l) => ({ id: l.id, title: L(l.title), count: l.exercises.length, state: states.get(l.id) ?? "locked", stars: stars.get(l.id) ?? 0 })),
    }));

  return (
    <main>
      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>{t("dailyGoal")}</h3>
          <span className="pill">
            {xpToday} / {goal} XP
          </span>
        </div>
        <div className="prog gold" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round((xpToday / goal) * 100))}>
          <i style={{ width: `${Math.min(100, (xpToday / goal) * 100)}%` }} />
        </div>
        <h3 style={{ marginTop: 14, fontSize: 16 }}>{t("quests")}</h3>
        {quests.map((q) => {
          const def = META.quests.find((d) => d.id === q.code)!;
          return (
            <div key={q.id} style={{ display: "grid", gap: 4, margin: "10px 0" }}>
              <b style={{ fontSize: 15, color: q.completedAt ? "var(--green-d)" : undefined }}>
                {q.completedAt ? "✅ " : ""}
                {L(def.title)}
              </b>
              <div className="prog">
                <i style={{ width: `${(q.progress / q.target) * 100}%` }} />
              </div>
              <small className="muted">
                {q.progress}/{q.target} · +{q.rewardXp} XP
              </small>
            </div>
          );
        })}
      </section>
      {!user.placementDone && done.size === 0 && (
        <section className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <h3>{t("placementT")}</h3>
            <p className="muted" style={{ margin: 0 }}>
              {t("placement")}
            </p>
          </div>
          <Link href="/play?mode=PLACEMENT" className="btn btn-sm btn-blue">
            {t("test")}
          </Link>
        </section>
      )}
      <nav className="tracks" aria-label={t("tracks")}>
        {META.tracks.map((tr) => {
          const list = trackLessons(units, tr.id);
          return (
            <Link key={tr.id} href={`/learn?track=${tr.id}`} aria-current={track === tr.id ? "page" : undefined}>
              <span aria-hidden="true">{tr.icon}</span>
              <b>{L(tr.title)}</b>
              <small>{t("lessons", { done: list.filter((x) => done.has(x.lesson.id)).length, total: list.length })}</small>
            </Link>
          );
        })}
      </nav>
      <Tree units={treeUnits} />
    </main>
  );
}
