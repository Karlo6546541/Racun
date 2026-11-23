import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { getViewer } from "@/server/viewer";
import { prisma } from "@/server/db";
import { getContent } from "@/server/content";
import { freeDailyMinutes } from "@/server/config";
import { AdminConfig, AdminGrant, AdminClearFlag } from "@/components/Admin";

export default async function Admin({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const v = await getViewer();
  if (v?.role !== "ADMIN") redirect({ href: "/", locale });
  const t = await getTranslations("admin");
  const L = (x: [string, string]) => x[locale === "en" ? 1 : 0];
  const { units } = await getContent();
  const stats = await prisma.analyticsEvent.groupBy({ by: ["name"], _sum: { count: true } });
  const flagged = await prisma.user.findMany({ where: { flagged: true }, take: 50, select: { id: true, email: true, name: true, flagReason: true } });
  const [users, premium] = await Promise.all([prisma.user.count({ where: { isGuest: false } }), prisma.subscription.count({ where: { status: { in: ["active", "trialing"] } } })]);
  return (
    <main className="wrap" style={{ paddingTop: 20, paddingBottom: 40 }}>
      <h1>{t("title")}</h1>
      <section className="card">
        <h3>{t("config")}</h3>
        <AdminConfig minutes={await freeDailyMinutes()} label={t("freeMinutes")} />
        <AdminGrant label={t("grant")} />
      </section>
      <section className="card">
        <h3>{t("stats")}</h3>
        <p>
          👤 {users} · ⭐ {premium}
        </p>
        <ul>
          {stats.map((s) => (
            <li key={s.name}>
              {s.name}: <b>{s._sum.count}</b>
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h3>{t("flagged")}</h3>
        {flagged.length === 0 && <p className="muted">—</p>}
        {flagged.map((u) => (
          <p key={u.id}>
            {u.email ?? u.name ?? u.id} · <span className="muted">{u.flagReason}</span> <AdminClearFlag id={u.id} />
          </p>
        ))}
      </section>
      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>{t("content")}</h3>
          {/* File download from an API route, not page navigation. */}
          <a className="btn btn-sm btn-ghost" href="/api/admin/export" download>
            {t("exportJson")}
          </a>
        </div>
        {units.map((u) => (
          <details key={u.id}>
            <summary style={{ fontWeight: 800, padding: "6px 0" }}>
              {u.icon} [{u.track}] {L(u.title)}
            </summary>
            {u.lessons.map((l) => (
              <div key={l.id} style={{ paddingLeft: 14 }}>
                <b>{L(l.title)}</b>
                <ul>
                  {l.exercises.map((e) => (
                    <li key={e.id}>
                      <Link href={`/admin/exercise/${e.id}`}>
                        {e.id} · {e.type} · {L(e.q).slice(0, 70)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
        ))}
      </section>
    </main>
  );
}
