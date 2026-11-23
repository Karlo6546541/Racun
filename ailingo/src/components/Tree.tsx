"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export type TreeUnit = { id: string; position: number; icon: string; color: string; title: string; summary: string; level: string; lessons: { id: string; title: string; count: number; state: "locked" | "open" | "done"; stars: number }[] };
const OFFS = [0, 34, 52, 34, 0, -34, -52, -34];

export function Tree({ units }: { units: TreeUnit[] }) {
  const t = useTranslations("learn");
  const tc = useTranslations("common");
  const [sheet, setSheet] = useState<{ unit: TreeUnit; lesson: TreeUnit["lessons"][number] } | null>(null);
  let first = true;
  return (
    <div>
      {units.map((u) => (
        <section key={u.id} aria-labelledby={`u-${u.id}`}>
          <div className="unit" style={{ background: u.color }}>
            <small>
              {t("unit", { n: u.position })} · {u.level} · {u.lessons.filter((l) => l.state === "done").length}/{u.lessons.length}
            </small>
            <h3 id={`u-${u.id}`}>
              {u.icon} {u.title}
            </h3>
            <p>{u.summary}</p>
          </div>
          <div className="path">
            {u.lessons.map((l, i) => {
              const go = l.state === "open" && first;
              if (l.state === "open") first = false;
              const lit = l.state !== "locked";
              return (
                <div key={l.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                  <button
                    type="button"
                    className={`node ${l.state}`}
                    data-id={l.id}
                    style={{ ["--x" as string]: `${OFFS[i % 8]}px`, ...(lit ? { ["--c" as string]: u.color, ["--cd" as string]: "rgba(0,0,0,.28)" } : {}) }}
                    aria-label={`${l.title} – ${t(l.state === "done" ? "stateDone" : l.state === "open" ? "stateOpen" : "stateLocked")}`}
                    onClick={() => setSheet({ unit: u, lesson: l })}
                  >
                    {go && <span className="go">{t("go")}</span>}
                    {l.state === "locked" ? "🔒" : l.state === "done" ? "✓" : u.icon}
                    {l.state === "done" && (
                      <span className="stars" aria-hidden="true">
                        {"⭐".repeat(Math.max(1, l.stars))}
                      </span>
                    )}
                  </button>
                  <div className="ntitle">{l.title}</div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {sheet && (
        <div className="sheet-bg" onClick={() => setSheet(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label={sheet.lesson.title} onClick={(e) => e.stopPropagation()}>
            <small className="muted" style={{ fontWeight: 800 }}>
              {t("unit", { n: sheet.unit.position })} · {sheet.unit.title}
            </small>
            <h2>{sheet.lesson.title}</h2>
            {sheet.lesson.state === "locked" ? (
              <>
                <p className="muted" style={{ margin: "10px 0 16px" }}>
                  {t("locked")}
                </p>
                <button className="btn btn-big btn-ghost" onClick={() => setSheet(null)} autoFocus>
                  {tc("close")}
                </button>
              </>
            ) : (
              <>
                <p className="muted" style={{ margin: "6px 0 16px" }}>
                  {t("info", { n: sheet.lesson.count })}
                  {sheet.lesson.state === "done" ? " · " + t("replayHint") : ""}
                </p>
                <Link href={`/play?mode=LESSON&lesson=${sheet.lesson.id}`} className="btn btn-big" data-testid="start-lesson" autoFocus>
                  {t("startXp", { label: sheet.lesson.state === "done" ? tc("replay") : tc("start") })}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
