import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireViewer } from "@/server/viewer";
import { myLeague } from "@/server/leagues";
import { globalBoard, friendsBoard } from "@/server/boards";
import { META } from "@/lib/content/meta";
import { DEMOTE_BOTTOM, PROMOTE_TOP } from "@/lib/game/leagues";
import { addDays, daysBetween, weekKey, dayKey } from "@/lib/time";

type Tab = "league" | "global" | "friends";

export default async function Leagues({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; range?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const tab: Tab = sp.tab === "global" ? "global" : sp.tab === "friends" ? "friends" : "league";
  const user = await requireViewer();
  const t = await getTranslations("leagues");
  const tc = await getTranslations("common");
  const L = (x: [string, string]) => x[locale === "en" ? 1 : 0];

  const tabs = (
    <div className="seg2" style={{ marginBottom: 12 }}>
      {(["league", "global", "friends"] as const).map((k) => (
        <Link key={k} href={`/leagues?tab=${k}`} aria-current={tab === k ? "page" : undefined}>
          {t(k === "league" ? "tabLeague" : k === "global" ? "tabGlobal" : "tabFriends")}
        </Link>
      ))}
    </div>
  );

  if (tab === "league") {
    const lg = await myLeague(user);
    const tier = META.tiers[lg.tier];
    const me = lg.rows.findIndex((r) => r.isMe) + 1;
    const daysLeft = daysBetween(dayKey(), addDays(weekKey(), 7));
    const lastText = lg.last ? (lg.last.rank <= PROMOTE_TOP ? "lastUp" : lg.last.rank > lg.rows.length - DEMOTE_BOTTOM ? "lastDown" : "lastStay") : null;
    return (
      <main>
        {tabs}
        <section className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44 }} aria-hidden="true">
            {tier.icon}
          </div>
          <h2>{t("league", { name: L(tier.name) })}</h2>
          <p className="muted">
            {t("daysLeft", { n: daysLeft })} · {t("rank", { n: me, total: lg.rows.length })}
          </p>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {t("rules")}
          </p>
        </section>
        {lastText && lg.last && <div className="note">{t(lastText, { rank: lg.last.rank })}</div>}
        <ol className="lb" style={{ listStyle: "none", padding: 0 }} data-testid="league">
          {lg.rows.map((r, i) => (
            <li key={r.id} className={`r ${r.isMe ? "me" : ""} ${i < PROMOTE_TOP ? "up" : i >= lg.rows.length - DEMOTE_BOTTOM ? "down" : ""}`}>
              <b>{i + 1}</b>
              <span className="av" aria-hidden="true">
                {r.avatar}
              </span>
              <span>
                {r.name}
                {r.isMe ? ` (${tc("you")})` : ""}
                {r.isBot && <small className="muted"> · {t("simulated")}</small>}
              </span>
              <span>{r.xp} XP</span>
            </li>
          ))}
        </ol>
        <p className="muted" style={{ fontSize: 13 }}>
          {t("bots")}
        </p>
      </main>
    );
  }

  const allTime = sp.range === "all";
  const rows = tab === "global" ? await globalBoard(user.id, allTime) : await friendsBoard(user.id);
  return (
    <main>
      {tabs}
      {tab === "global" && (
        <div className="seg2" style={{ marginBottom: 12 }}>
          <Link href="/leagues?tab=global" aria-current={!allTime ? "page" : undefined}>
            {t("weekly")}
          </Link>
          <Link href="/leagues?tab=global&range=all" aria-current={allTime ? "page" : undefined}>
            {t("allTime")}
          </Link>
        </div>
      )}
      {tab === "global" && user.isGuest && <div className="note">{t("guestNote")}</div>}
      <ol className="lb" style={{ listStyle: "none", padding: 0 }}>
        {rows.map((r) => (
          <li key={r.id} className={`r ${r.isMe ? "me" : ""}`}>
            <b>{r.rank}</b>
            <span className="av" aria-hidden="true">
              {r.isMe ? "🤖" : "🙂"}
            </span>
            <span>
              {r.name}
              {r.isMe ? ` (${tc("you")})` : ""}
            </span>
            <span>{r.xp} XP</span>
          </li>
        ))}
      </ol>
    </main>
  );
}
