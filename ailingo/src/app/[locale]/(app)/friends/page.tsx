import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageViewer } from "@/server/viewer";
import { prisma } from "@/server/db";
import { weekKey, dayKey } from "@/lib/time";
import { visibleStreak } from "@/lib/game/streak";
import { FriendForm, FriendActions } from "@/components/Friends";
import { Link } from "@/i18n/navigation";

export default async function Friends({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await pageViewer();
  const t = await getTranslations("friends");
  if (user.isGuest)
    return (
      <main>
        <section className="card">
          <p>{t("guest")}</p>
          <Link href="/signin" className="btn btn-big">
            {t("add")}
          </Link>
        </section>
      </main>
    );
  const fs = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: user.id }, { addresseeId: user.id }] },
    include: { requester: { select: { id: true, name: true, streak: true, streakFreezes: true } }, addressee: { select: { id: true, name: true, streak: true, streakFreezes: true } } },
  });
  const other = (f: (typeof fs)[number]) => (f.requesterId === user.id ? f.addressee : f.requester);
  const accepted = fs.filter((f) => f.status === "ACCEPTED");
  const incoming = fs.filter((f) => f.status === "PENDING" && f.addresseeId === user.id);
  const outgoing = fs.filter((f) => f.status === "PENDING" && f.requesterId === user.id);
  const xp = await prisma.xPEvent.groupBy({ by: ["userId"], where: { userId: { in: accepted.map((f) => other(f).id) }, weekKey: weekKey() }, _sum: { amount: true } });
  const xpMap = new Map(xp.map((x) => [x.userId, x._sum.amount ?? 0]));
  const today = dayKey();
  return (
    <main>
      <section className="card">
        <h3>{t("code")}</h3>
        <p style={{ fontSize: 24, fontWeight: 900, margin: "4px 0" }} data-testid="friend-code">
          {user.friendCode}
        </p>
      </section>
      <section className="card">
        <h3>{t("add")}</h3>
        <FriendForm />
      </section>
      {incoming.length > 0 && (
        <section className="card">
          <h3>{t("requests")}</h3>
          {incoming.map((f) => (
            <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", gap: 8 }}>
              <b>{other(f).name || "AIlingo"}</b>
              <FriendActions id={f.id} kind="incoming" />
            </div>
          ))}
        </section>
      )}
      <section className="card">
        <h3>{t("list", { n: accepted.length })}</h3>
        {accepted.length === 0 && <p className="muted">{t("none")}</p>}
        {accepted.map((f) => {
          const o = other(f);
          const s = visibleStreak({ current: o.streak?.current ?? 0, longest: o.streak?.longest ?? 0, lastActiveDay: o.streak?.lastActiveDay ?? null }, today, o.streakFreezes);
          return (
            <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", gap: 8 }}>
              <span>
                <b>{o.name || "AIlingo"}</b>
                <br />
                <small className="muted">
                  🔥 {s} · {t("weekXp", { xp: xpMap.get(o.id) ?? 0 })}
                </small>
              </span>
              <FriendActions id={f.id} kind="friend" />
            </div>
          );
        })}
        {outgoing.map((f) => (
          <p key={f.id} className="muted" style={{ fontSize: 14 }}>
            {other(f).name || "AIlingo"} · {t("pending")}
          </p>
        ))}
      </section>
    </main>
  );
}
