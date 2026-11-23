"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import type { ClientAnswer, ClientExercise, Reveal } from "@/lib/grading/present";
import { api } from "@/lib/client/api";
import { sfx, setSound } from "@/lib/client/sfx";
import { confetti } from "@/lib/client/confetti";
import { ExerciseView } from "../exercises";
import { Mascot } from "../Mascot";
import { Paywall } from "./Paywall";
import { fmt } from "./Countdown";

type Usage = { premium: boolean; usedSeconds: number; limitSeconds: number; remainingSeconds: number | null; blocked: boolean };
type StartRes = { sessionId: string; mode: Mode; title: string; endAt: number | null; hearts: number; exercises: ClientExercise[]; remaining?: string[]; done?: number; usage: Usage };
type AnswerRes = { reveal: Reveal; xpGained: number; combo: number; hearts: number; requeue: boolean; outOfHearts: boolean; newBadges: { id: string; icon: string; title: string }[]; questsDone: string[]; usage: Usage };
type Summary = {
  mode: Mode; completed: boolean; failed: boolean; xp: number; accuracy: number; stars?: number; gems?: number; seconds: number; heartGained?: boolean; fixed?: number; correct: number; answered: number; comboBest: number; blitzRecord?: boolean;
  placement?: { score: number; total: number; skipped: number }; levelBefore: number; levelAfter: number; newBadges: { id: string; icon: string; title: string }[]; streak?: number;
};
type Mode = "LESSON" | "PRACTICE" | "BLITZ" | "PLACEMENT";
type Phase = "loading" | "play" | "summary" | "levelup" | "paywall" | "nohearts" | "error";
type Item = { ex: ClientExercise; key: string };

const QUICK = new Set(["mc", "tf", "compare"]);
const resumeKey = (lessonId: string) => `ailingo.resume.${lessonId}`;
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* storage is optional */
    }
  },
};

export function Player({ mode, lessonId, practice, sound, tz, freeMinutes, streak }: { mode: Mode; lessonId?: string; practice?: "review" | "free"; sound: boolean; tz: string; freeMinutes: number; streak: number }) {
  const t = useTranslations("player");
  const tc = useTranslations("common");
  const tt = useTranslations("types");
  const tp = useTranslations("paywall");
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [session, setSession] = useState<StartRes | null>(null);
  const [queue, setQueue] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [answer, setAnswer] = useState<ClientAnswer | null>(null);
  const [res, setRes] = useState<AnswerRes | null>(null);
  const [busy, setBusy] = useState(false);
  const [hearts, setHearts] = useState(5);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const pickRef = useRef<((n: number) => void) | null>(null);
  const lastInteraction = useRef(Date.now());
  const startedRef = useRef(false);

  useEffect(() => setSound(sound), [sound]);
  const say = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((x) => (x === m ? null : x)), 2600);
  }, []);

  // Start or resume
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const resume = mode === "LESSON" && lessonId ? store.get(resumeKey(lessonId)) : null;
      const r = await api<StartRes>("/api/play/start", { mode, lessonId, practice, resume: resume ?? undefined });
      if (!r.ok) {
        if (r.error === "PAYWALL") return setPhase("paywall");
        if (r.error === "NO_HEARTS") return setPhase("nohearts");
        setErrorMsg(r.error === "LOCKED" ? t("locked") : r.error === "NOT_FOUND" && mode !== "LESSON" ? t("nothing") : r.error === "OFFLINE" ? tc("offline") : tc("error"));
        return setPhase("error");
      }
      const s = r.data;
      setSession(s);
      setHearts(s.hearts);
      setUsage(s.usage);
      const remaining = s.remaining ? s.exercises.filter((e) => s.remaining!.includes(e.id)) : s.exercises;
      setQueue(remaining.map((ex, i) => ({ ex, key: ex.id + ":" + i })));
      setTotal(s.exercises.length);
      setDone(s.exercises.length - remaining.length);
      if (mode === "LESSON" && lessonId) store.set(resumeKey(lessonId), s.sessionId);
      setPhase("play");
    })();
  }, [mode, lessonId, practice, t, tc]);

  // Heartbeat: only while visible and recently interacted with.
  useEffect(() => {
    if (phase !== "play") return;
    const mark = () => (lastInteraction.current = Date.now());
    window.addEventListener("pointerdown", mark);
    window.addEventListener("keydown", mark);
    const id = window.setInterval(async () => {
      if (document.visibilityState !== "visible" || Date.now() - lastInteraction.current > 30_000) return;
      const r = await api<Usage>("/api/usage/beat", { sessionId: session?.sessionId });
      if (r.ok) {
        setUsage(r.data);
        if (!r.data.premium && r.data.remainingSeconds !== null && r.data.remainingSeconds <= 60 && r.data.remainingSeconds > 45) say(tp("warn"));
      }
    }, 15_000);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
    };
  }, [phase, session, say, tp]);

  // Blitz clock
  useEffect(() => {
    if (phase !== "play" || !session?.endAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [phase, session]);

  const finish = useCallback(async () => {
    if (!session) return;
    setPhase("loading");
    const r = await api<Summary>("/api/play/finish", { sessionId: session.sessionId });
    if (mode === "LESSON" && lessonId) store.set(resumeKey(lessonId), null);
    if (!r.ok) {
      setErrorMsg(tc("error"));
      return setPhase("error");
    }
    const s = r.data;
    setSummary(s);
    if (s.failed) return setPhase("nohearts");
    sfx("finish");
    if (s.mode !== "BLITZ" || s.blitzRecord) confetti();
    setPhase("summary");
  }, [session, mode, lessonId, tc]);

  const blitzOver = !!session?.endAt && now >= session.endAt;
  useEffect(() => {
    if (blitzOver && phase === "play") void finish();
  }, [blitzOver, phase, finish]);

  const current = queue[0];

  const check = useCallback(async () => {
    if (!session || !current || !answer || res || busy) return;
    setBusy(true);
    const r = await api<AnswerRes>("/api/play/answer", { sessionId: session.sessionId, exerciseId: current.ex.id, answer });
    setBusy(false);
    if (!r.ok) {
      if (r.error === "PAYWALL") return setPhase("paywall");
      if (r.error === "NO_HEARTS") return void finish();
      if (r.error === "TOO_FAST") return say(t("tooFast"));
      if (r.error === "CONFLICT" && session.endAt) return void finish();
      return say(r.error === "OFFLINE" ? tc("offline") : tc("error"));
    }
    const d = r.data;
    setRes(d);
    setHearts(d.hearts);
    setUsage(d.usage);
    sfx(d.reveal.correct ? (d.combo >= 3 ? "combo" : "correct") : "wrong");
    for (const b of d.newBadges) say(t("badge", { title: `${b.icon} ${b.title}` }));
    for (const q of d.questsDone) say(t("quest", { title: q }));
    if (session.endAt) window.setTimeout(() => advance(d), d.reveal.correct ? 650 : 1300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, current, answer, res, busy, finish, say, t, tc]);

  const advance = useCallback(
    (d: AnswerRes | null = res) => {
      if (!d || !current) return;
      const rest = queue.slice(1);
      if (d.requeue) rest.push({ ex: current.ex, key: current.key + "r" });
      else setDone((x) => x + 1);
      setQueue(rest);
      setAnswer(null);
      setRes(null);
      pickRef.current = null;
      window.scrollTo(0, 0);
      if (d.outOfHearts) return void finish();
      if (d.usage.blocked && !d.usage.premium) return setPhase("paywall");
      if (!rest.length) return void finish();
    },
    [res, current, queue, finish],
  );

  // Auto-check quick answers in Blitz
  useEffect(() => {
    if (session?.endAt && answer && current && QUICK.has(current.ex.type) && !res) void check();
  }, [answer, session, current, res, check]);

  // Keyboard: Enter checks/continues, digits pick options
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "play") return;
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "Enter" && tag !== "BUTTON" && tag !== "TEXTAREA" && tag !== "A") {
        e.preventDefault();
        if (res && !session?.endAt) advance();
        else void check();
      } else if (!res && tag !== "INPUT" && tag !== "TEXTAREA" && /^[1-9]$/.test(e.key)) pickRef.current?.(Number(e.key) - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, res, session, advance, check]);

  if (phase === "loading")
    return (
      <div className="sum">
        <Mascot mood="think" size={96} />
        <p className="muted">{tc("loading")}</p>
      </div>
    );
  if (phase === "paywall") return <Paywall minutes={freeMinutes} tz={tz} />;
  if (phase === "error")
    return (
      <div className="sum">
        <Mascot mood="sad" size={110} />
        <p>{errorMsg}</p>
        <Link href="/learn" className="btn btn-big">
          {t("toTree")}
        </Link>
      </div>
    );
  if (phase === "nohearts")
    return (
      <div className="sum">
        <Mascot mood="sad" size={120} />
        <h1>{t("noHearts")}</h1>
        <p className="muted">{t("noHeartsText")}</p>
        <Link href="/play?mode=PRACTICE&practice=free" className="btn btn-big">
          {t("practiceForHeart")}
        </Link>
        <Link href="/learn" className="btn btn-big btn-ghost" style={{ marginTop: 12 }}>
          {tc("back")}
        </Link>
      </div>
    );
  if (phase === "levelup" && summary)
    return (
      <div className="sum">
        <Mascot mood="cheer" size={120} />
        <h1>{t("levelUp")}</h1>
        <div className="lvl">{summary.levelAfter}</div>
        <p className="muted">{t("levelUpText")}</p>
        <button className="btn btn-big" onClick={() => router.push("/learn")}>
          {t("awesome")}
        </button>
      </div>
    );
  if (phase === "summary" && summary) return <SummaryView s={summary} streak={streak} onNext={() => (summary.levelAfter > summary.levelBefore ? (confetti(), sfx("combo"), setPhase("levelup")) : router.push(summary.mode === "PRACTICE" || summary.mode === "BLITZ" ? "/practice" : "/learn"))} />;
  if (!session || !current) return null;

  const blitz = !!session.endAt;
  const pct = blitz ? Math.max(0, ((session.endAt! - now) / 60000) * 100) : total ? (done / total) * 100 : 0;
  const ok = res?.reveal.correct;
  const remaining = usage && !usage.premium && usage.remainingSeconds !== null ? usage.remainingSeconds : null;
  const praise = [t("praise1"), t("praise2"), t("praise3"), t("praise4")];
  const title = res ? (ok ? (res.combo >= 3 ? t("combo", { n: res.combo }) : praise[(done + total) % praise.length]) : current.ex.type === "rubric" ? t("rubricWrong") : t("wrong")) : "";

  return (
    <div className="les wrap">
      <div className="lhead">
        <button className="btn-sm" style={{ background: "none", border: 0, fontSize: 22, color: "var(--muted)" }} aria-label={t("quit")} onClick={() => setConfirmQuit(true)}>
          ✕
        </button>
        <div className="bar" role="progressbar" aria-label={blitz ? t("timeLeft") : t("progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <div style={{ fontWeight: 900, minWidth: 52, textAlign: "right" }}>
          {mode === "LESSON" ? `❤️ ${hearts}` : blitz ? `⏱ ${Math.max(0, Math.ceil((session.endAt! - now) / 1000))}s` : ""}
        </div>
      </div>
      {remaining !== null && <p className="muted" style={{ fontSize: 12, fontWeight: 800, margin: "-6px 0 6px", textAlign: "right" }} data-testid="meter">{tp("meter", { time: fmt(remaining) })}</p>}
      <div className="lbody">
        <div className="qtype">{tt(current.ex.type)}</div>
        <h2 className="qtext">{current.ex.q}</h2>
        <ExerciseView key={current.key} ex={current.ex} reveal={res?.reveal ?? null} onChange={setAnswer} pickRef={pickRef} submit={() => void check()} />
      </div>
      <div className={`lfoot ${res ? (ok ? "ok" : "bad") : ""}`} role="status" aria-live="polite">
        {confirmQuit ? (
          <div>
            <p style={{ textAlign: "center", fontWeight: 900, margin: "0 0 10px" }}>{t("quitQ")}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setConfirmQuit(false)}>
                {t("keep")}
              </button>
              <button className="btn btn-red" onClick={() => router.push("/learn")}>
                {t("leave")}
              </button>
            </div>
          </div>
        ) : res ? (
          <div>
            <div className="fbrow">
              <Mascot mood={ok ? "cheer" : "sad"} size={54} />
              <div>
                <b>{title}</b>
                {!blitz && <p>{res.reveal.explanation}</p>}
              </div>
            </div>
            {!blitz && (
              <button className={`btn btn-big ${ok ? "" : "btn-red"}`} autoFocus onClick={() => advance()} data-testid="next">
                {queue.length <= 1 && !res.requeue ? tc("finish") : tc("continue")}
              </button>
            )}
          </div>
        ) : blitz && QUICK.has(current.ex.type) ? (
          <p className="muted" style={{ textAlign: "center", margin: 0, fontWeight: 800 }}>
            {t("blitzPick")}
          </p>
        ) : (
          <button className="btn btn-big" disabled={!answer || busy} onClick={() => void check()} data-testid="check">
            {tc("check")}
          </button>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function SummaryView({ s, streak, onNext }: { s: Summary; streak: number; onNext: () => void }) {
  const t = useTranslations("player");
  const tc = useTranslations("common");
  const mm = Math.floor(s.seconds / 60) + ":" + String(s.seconds % 60).padStart(2, "0");
  let title = t("lessonDone");
  let sub = "";
  let stats: [string, string | number][] = [];
  if (s.mode === "LESSON") {
    sub = "⭐".repeat(s.stars ?? 1);
    stats = [["XP", "+" + s.xp], [t("accuracy"), s.accuracy + "%"], [t("time"), mm]];
  } else if (s.mode === "PRACTICE") {
    title = t("practiceDone");
    sub = s.heartGained ? t("heartBack") : "";
    stats = [["XP", s.xp], [t("fixed"), s.fixed ?? 0], [t("correct"), `${s.correct}/${s.answered}`]];
  } else if (s.mode === "BLITZ") {
    title = t("blitzDone");
    sub = s.blitzRecord ? t("record") : "";
    stats = [["XP", s.xp], [t("correct"), s.correct], [t("bestCombo"), s.comboBest]];
  } else if (s.placement) {
    title = t("placementDone");
    sub = s.placement.skipped ? t("skipped", { n: s.placement.skipped }) : t("fromStart");
    stats = [[t("score"), `${s.placement.score}/${s.placement.total}`], [t("skippedLabel"), s.placement.skipped], ["XP", 0]];
  }
  return (
    <div className="sum wrap" data-testid="summary">
      <Mascot mood="cheer" size={120} />
      <h1 style={{ fontSize: 30 }}>{title}</h1>
      {sub && <p className="muted">{sub}</p>}
      <div className="sstats">
        {stats.map(([k, v]) => (
          <div key={k}>
            <b>{v}</b>
            <small>{k}</small>
          </div>
        ))}
      </div>
      {s.mode === "LESSON" && <p className="muted" style={{ margin: "-8px 0 16px" }}>{t("streakLine", { n: streak + (streak === 0 ? 1 : 0), gems: s.gems ?? 0 })}</p>}
      {s.newBadges.map((b) => (
        <p key={b.id} style={{ fontWeight: 800 }}>
          {t("badge", { title: `${b.icon} ${b.title}` })}
        </p>
      ))}
      <button className="btn btn-big" onClick={onNext} data-testid="summary-next">
        {tc("continue")}
      </button>
    </div>
  );
}
