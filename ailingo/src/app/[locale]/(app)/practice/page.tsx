import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageViewer } from "@/server/viewer";
import { prisma } from "@/server/db";
import { getContent } from "@/server/content";

export default async function Practice({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await pageViewer();
  const t = await getTranslations("practice");
  const L = (x: [string, string]) => x[locale === "en" ? 1 : 0];
  const { exercises } = await getContent();
  const due = await prisma.reviewItem.count({ where: { userId: user.id, dueAt: { lte: new Date() } } });
  const mistakes = await prisma.reviewItem.findMany({ where: { userId: user.id, inMistakes: true }, orderBy: { dueAt: "asc" }, take: 20 });
  return (
    <main>
      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>🔁 {t("srs")}</h3>
          <span className="pill">{t("due", { n: due })}</span>
        </div>
        <p className="muted">{t("srsText")}</p>
        {due ? (
          <Link href="/play?mode=PRACTICE&practice=review" className="btn btn-big">
            {t("startReview")}
          </Link>
        ) : (
          <button className="btn btn-big" disabled>
            {t("nothingDue")}
          </button>
        )}
      </section>
      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>⚡ {t("blitz")}</h3>
          <span className="pill">{t("best", { n: user.blitzBest })}</span>
        </div>
        <p className="muted">{t("blitzText")}</p>
        <Link href="/play?mode=BLITZ" className="btn btn-big btn-blue">
          {t("startBlitz")}
        </Link>
      </section>
      <section className="card">
        <h3>🎲 {t("free")}</h3>
        <p className="muted">{t("freeText")}</p>
        <Link href="/play?mode=PRACTICE&practice=free" className="btn btn-big btn-ghost">
          {t("startFree")}
        </Link>
      </section>
      <section className="card">
        <h3>📝 {t("mistakes", { n: mistakes.length })}</h3>
        {mistakes.length ? (
          <>
            {mistakes.map((m) => {
              const ex = exercises.get(m.exerciseId)?.ex;
              if (!ex) return null;
              return (
                <p key={m.id} style={{ margin: "10px 0 0" }}>
                  <b>{L(ex.q)}</b>
                  <br />
                  <span className="muted" style={{ fontSize: 14 }}>
                    {L(ex.explain)}
                  </span>
                </p>
              );
            })}
            <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
              {t("mistakesHint")}
            </p>
          </>
        ) : (
          <p className="muted">{t("mistakesEmpty")}</p>
        )}
      </section>
    </main>
  );
}
