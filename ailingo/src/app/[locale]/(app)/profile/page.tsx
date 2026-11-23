import { getTranslations, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { Link } from "@/i18n/navigation";
import { pageViewer } from "@/server/viewer";
import { prisma } from "@/server/db";
import { homeData } from "@/server/home";
import { clientIp } from "@/server/ratelimit";
import { doSignOut } from "@/server/actions";
import { META } from "@/lib/content/meta";
import { DAILY_GOAL_XP, levelStart } from "@/lib/game/xp";
import { readStats } from "@/lib/game/stats";
import { dayKey } from "@/lib/time";
import { Mascot } from "@/components/Mascot";

export default async function Profile({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await pageViewer();
  const d = await homeData(user, clientIp(await headers()));
  const t = await getTranslations("profile");
  const tc = await getTranslations("common");
  const L = (x: [string, string]) => x[locale === "en" ? 1 : 0];
  const stats = readStats(user.stats);
  const acc = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
  const lessons = await prisma.progress.count({ where: { userId: user.id, done: true } });
  const badges = new Set((await prisma.userBadge.findMany({ where: { userId: user.id } })).map((b) => b.badgeId));
  const a = levelStart(d.level);
  const b = levelStart(d.level + 1);

  const now = new Date();
  const today = dayKey(now, user.timezone);
  const [y, m] = today.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prefix = `${y}-${String(m).padStart(2, "0")}-`;
  const act = await prisma.xPEvent.groupBy({ by: ["dayKey"], where: { userId: user.id, dayKey: { startsWith: prefix } }, _sum: { amount: true } });
  const actMap = new Map(act.map((x) => [x.dayKey, x._sum.amount ?? 0]));
  const goal = DAILY_GOAL_XP[user.dailyGoalMin] ?? 100;
  const wd = locale === "en" ? ["M", "T", "W", "T", "F", "S", "S"] : ["P", "U", "S", "Č", "P", "S", "N"];

  return (
    <main>
      <section className="card" style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Mascot size={96} />
        </div>
        <h2>{user.name || tc("guest")}</h2>
        <p className="muted">
          {tc("level", { level: d.level })} · {user.xpTotal} XP{d.usage.premium ? ` · ⭐ ${t("premium")}` : ""}
        </p>
        <div className="prog" aria-label="XP">
          <i style={{ width: `${((user.xpTotal - a) / (b - a)) * 100}%` }} />
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          {t("toLevel", { xp: b - user.xpTotal, level: d.level + 1 })}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/settings" className="btn btn-sm btn-ghost">
            ⚙️ {t("settings")}
          </Link>
          {user.isGuest ? (
            <Link href="/signin" className="btn btn-sm">
              {t("signin")}
            </Link>
          ) : (
            <form action={doSignOut}>
              <button className="btn btn-sm btn-ghost">{t("signout")}</button>
            </form>
          )}
        </div>
      </section>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {[
          ["🔥 " + d.bestStreak, t("bestStreak")],
          [String(lessons), t("lessons")],
          [acc + "%", t("accuracy")],
          [user.streakFreezes + " 🧊", "Streak Freeze"],
        ].map(([v, k]) => (
          <div key={k} className="card" style={{ margin: 0, textAlign: "center" }}>
            <b style={{ fontSize: 24 }}>{v}</b>
            <br />
            <span className="muted">{k}</span>
          </div>
        ))}
      </div>
      <section className="card">
        <h3>{t("calendar")}</h3>
        <div className="cal">
          {wd.map((x, i) => (
            <b key={i} aria-hidden="true">
              {x}
            </b>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <i key={"e" + i} className="e" />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const k = prefix + String(i + 1).padStart(2, "0");
            const x = actMap.get(k) ?? 0;
            return (
              <i key={k} className={`${x >= goal ? "g" : x > 0 ? "a" : ""} ${k === today ? "t" : ""}`} title={`${x} XP`}>
                {i + 1}
              </i>
            );
          })}
        </div>
      </section>
      <section className="card">
        <h3>{t("badges", { have: badges.size, all: META.badges.length })}</h3>
        <div className="badges">
          {META.badges.map((bd) => (
            <div key={bd.id} className={`bd ${badges.has(bd.id) ? "" : "off"}`}>
              <span aria-hidden="true">{bd.icon}</span>
              {L(bd.title)}
              <br />
              <small className="muted">{L(bd.desc)}</small>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
