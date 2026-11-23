import type { PlayMode, User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db";
import { AppError } from "./errors";
import { getContent, lessonStates } from "./content";
import { getUsage, serializeUsage } from "./usage";
import { awardXp, bumpStats, checkBadges, questEvent } from "./game";
import { hmacSecret } from "./config";
import { track } from "./analytics";
import { META } from "@/lib/content/meta";
import type { Exercise } from "@/lib/content/schema";
import { ClientAnswerSchema, reveal, toCanonical, toClient, type Ctx, type Lang } from "@/lib/grading/present";
import { gradeWithFallback } from "@/lib/grading";
import { answerXp, lessonBonus, levelFor, starsFor } from "@/lib/game/xp";
import { gainHeart, loseHeart, tickHearts } from "@/lib/game/hearts";
import { canAnswer } from "@/lib/game/usage";
import { qualityFor, sm2 } from "@/lib/srs/sm2";

const MIN_ANSWER_MS = 600;
const BLITZ_MS = 60_000;
const QUICK_TYPES = new Set(["mc", "tf", "compare", "fill"]);

type PlayState = {
  lang: Lang;
  xp0: number;
  answered: Record<string, number>;
  correctIds: string[];
  combo: number;
  comboBest: number;
  xp: number;
  wrong: number;
  correct: number;
  firstTry: number;
  fixed: number;
  outOfHearts: boolean;
  lastAt: number;
  endAt?: number;
};

export const StartSchema = z.object({
  mode: z.enum(["LESSON", "PRACTICE", "BLITZ", "PLACEMENT"]),
  lessonId: z.string().max(40).optional(),
  practice: z.enum(["review", "free"]).optional(),
  resume: z.string().max(40).optional(),
});
export const AnswerSchema = z.object({ sessionId: z.string().min(1).max(40), exerciseId: z.string().min(1).max(40), answer: ClientAnswerSchema });

const lang = (u: User): Lang => (u.locale === "en" ? "en" : "hr");
const shuffle = <T>(a: T[]) => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

async function refreshHearts(user: User): Promise<User> {
  const h = tickHearts({ hearts: user.hearts, refillAt: user.heartsRefillAt });
  if (h.hearts === user.hearts && h.refillAt?.getTime() === user.heartsRefillAt?.getTime()) return user;
  return prisma.user.update({ where: { id: user.id }, data: { hearts: h.hearts, heartsRefillAt: h.refillAt } });
}

export async function startSession(user0: User, input: z.infer<typeof StartSchema>, ip: string | null) {
  const user = await refreshHearts(user0);
  const usage = await getUsage(user, ip);
  if (usage.blocked) {
    await track("paywall_shown");
    throw new AppError("PAYWALL", "Daily free learning time is used up.");
  }
  const { units, lessons, exercises } = await getContent();
  let list: Exercise[] = [];
  let title = "";
  if (input.mode === "LESSON") {
    const info = input.lessonId ? lessons.get(input.lessonId) : undefined;
    if (!info) throw new AppError("NOT_FOUND", "Lesson not found");
    const done = new Set((await prisma.progress.findMany({ where: { userId: user.id, done: true }, select: { lessonId: true } })).map((p) => p.lessonId));
    if (lessonStates(units, done).get(info.lesson.id) === "locked") throw new AppError("LOCKED", "Finish the previous lesson first.");
    if (user.hearts <= 0) throw new AppError("NO_HEARTS");
    if (input.resume) {
      const prev = await prisma.playSession.findFirst({ where: { id: input.resume, userId: user.id, lessonId: info.lesson.id, mode: "LESSON", finishedAt: null, startedAt: { gte: new Date(Date.now() - 7 * 864e5) } } });
      const pst = prev?.state as unknown as PlayState | undefined;
      if (prev && pst && !pst.outOfHearts) {
        const remaining = prev.exerciseIds.filter((id) => !pst.correctIds.includes(id) && (pst.answered[id] ?? 0) < 2);
        if (remaining.length) {
          pst.lastAt = Date.now();
          await prisma.playSession.update({ where: { id: prev.id }, data: { state: pst } });
          const ctx: Ctx = { secret: hmacSecret(), sessionId: prev.id, lang: pst.lang };
          const all = prev.exerciseIds.map((id) => exercises.get(id)?.ex).filter((e): e is Exercise => !!e);
          return { sessionId: prev.id, mode: input.mode, title: info.lesson.title[pst.lang === "en" ? 1 : 0], endAt: null, hearts: user.hearts, exercises: all.map((e) => toClient(e, ctx)), remaining, usage: serializeUsage(usage) };
        }
      }
    }
    list = info.lesson.exercises;
    title = info.lesson.title[lang(user) === "en" ? 1 : 0];
  } else if (input.mode === "PLACEMENT") {
    list = META.placement.exercises.map((id) => exercises.get(id)?.ex).filter((e): e is Exercise => !!e);
  } else {
    const doneIds = (await prisma.progress.findMany({ where: { userId: user.id, done: true }, select: { lessonId: true } })).map((p) => p.lessonId);
    const fromDone = doneIds.flatMap((id) => lessons.get(id)?.lesson.exercises ?? []);
    const allPublished = units.filter((u) => u.published).flatMap((u) => u.lessons.flatMap((l) => l.exercises));
    if (input.mode === "BLITZ") list = shuffle((fromDone.length ? fromDone : allPublished).filter((e) => QUICK_TYPES.has(e.type))).slice(0, 60);
    else if (input.practice === "free") list = shuffle(fromDone.length ? fromDone : allPublished.slice(0, 40)).slice(0, 8);
    else {
      const due = await prisma.reviewItem.findMany({ where: { userId: user.id, dueAt: { lte: new Date() } }, orderBy: { dueAt: "asc" }, take: 8 });
      list = due.map((d) => exercises.get(d.exerciseId)?.ex).filter((e): e is Exercise => !!e);
    }
    if (!list.length) throw new AppError("NOT_FOUND", "Nothing to practice yet.");
  }
  const state: PlayState = { lang: lang(user), xp0: user.xpTotal, answered: {}, correctIds: [], combo: 0, comboBest: 0, xp: 0, wrong: 0, correct: 0, firstTry: 0, fixed: 0, outOfHearts: false, lastAt: Date.now() };
  if (input.mode === "BLITZ") state.endAt = Date.now() + BLITZ_MS;
  const session = await prisma.playSession.create({ data: { userId: user.id, mode: input.mode as PlayMode, lessonId: input.lessonId, exerciseIds: list.map((e) => e.id), state } });
  const ctx: Ctx = { secret: hmacSecret(), sessionId: session.id, lang: state.lang };
  return { sessionId: session.id, mode: input.mode, title, endAt: state.endAt ?? null, hearts: user.hearts, exercises: list.map((e) => toClient(e, ctx)), usage: serializeUsage(usage) };
}

export async function answer(user: User, input: z.infer<typeof AnswerSchema>, ip: string | null) {
  const session = await prisma.playSession.findUnique({ where: { id: input.sessionId } });
  if (!session || session.userId !== user.id) throw new AppError("NOT_FOUND", "Session not found");
  if (session.finishedAt) throw new AppError("CONFLICT", "Session already finished");
  if (!session.exerciseIds.includes(input.exerciseId)) throw new AppError("BAD_REQUEST", "Exercise is not part of this session");
  const st = session.state as unknown as PlayState;
  const now = Date.now();
  if (st.endAt && now > st.endAt + 5000) throw new AppError("CONFLICT", "Time is up");
  if (now - st.lastAt < MIN_ANSWER_MS) {
    await prisma.user.update({ where: { id: user.id }, data: { flagged: true, flagReason: "answers faster than humanly possible" } });
    throw new AppError("TOO_FAST", "Slow down a little.");
  }
  const count = st.answered[input.exerciseId] ?? 0;
  const maxTries = session.mode === "LESSON" ? 2 : 1;
  if (count >= maxTries || st.correctIds.includes(input.exerciseId)) throw new AppError("CONFLICT", "Already answered");
  if (session.mode === "LESSON" && st.outOfHearts) throw new AppError("NO_HEARTS");

  const usage = await getUsage(user, ip);
  if (!canAnswer(usage.premium, usage.usedSeconds, usage.limitSeconds)) throw new AppError("PAYWALL");

  const { exercises } = await getContent();
  const ex = exercises.get(input.exerciseId)?.ex;
  if (!ex) throw new AppError("NOT_FOUND");
  const ctx: Ctx = { secret: hmacSecret(), sessionId: session.id, lang: st.lang };
  const canonical = toCanonical(ex, input.answer, ctx);
  if (!canonical) throw new AppError("BAD_REQUEST", "Answer has the wrong shape for this exercise");
  const result = await gradeWithFallback(ex, canonical);
  const firstTry = count === 0;

  const out = await prisma.$transaction(async (tx) => {
    let xpGained = 0;
    let requeue = false;
    const questsDone: string[] = [];
    let u = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    await tx.attempt.create({ data: { userId: u.id, exerciseId: ex.id, sessionId: session.id, mode: session.mode, correct: result.correct, score: result.score, answer: input.answer, timeMs: now - st.lastAt } });
    st.answered[ex.id] = count + 1;
    if (result.correct) {
      st.correct++;
      st.correctIds.push(ex.id);
      if (firstTry) st.firstTry++;
      st.combo++;
      st.comboBest = Math.max(st.comboBest, st.combo);
      const xp = answerXp({ mode: session.mode, firstTry, combo: st.combo, rubricScore: ex.type === "rubric" ? result.score : undefined });
      xpGained = (await awardXp(tx, u, xp, session.mode === "BLITZ" ? "BLITZ" : session.mode === "PRACTICE" ? "PRACTICE" : "EXERCISE", ex.id)).granted;
      st.xp += xpGained;
      const review = await tx.reviewItem.findUnique({ where: { userId_exerciseId: { userId: u.id, exerciseId: ex.id } } });
      if (review && session.mode === "PRACTICE") {
        const next = sm2(review, qualityFor(true, firstTry));
        await tx.reviewItem.update({ where: { id: review.id }, data: { ...next, inMistakes: false } });
        if (review.inMistakes) {
          st.fixed++;
          const q = await questEvent(tx, u, "fix", 1);
          if (q) questsDone.push(q);
        }
      }
      await bumpStats(tx, u.id, (s) => ({
        ...s,
        answered: s.answered + 1,
        correct: s.correct + 1,
        comboBest: Math.max(s.comboBest, st.combo),
        halluc: s.halluc + (ex.type === "spot" ? 1 : 0),
        promptsDone: s.promptsDone + (["build", "doctor", "rubric"].includes(ex.type) ? 1 : 0),
        rubricPass: s.rubricPass + (ex.type === "rubric" ? 1 : 0),
      }));
      const q = await questEvent(tx, u, "combo", st.combo);
      if (q) questsDone.push(q);
    } else {
      st.combo = 0;
      st.wrong++;
      await bumpStats(tx, u.id, (s) => ({ ...s, answered: s.answered + 1 }));
      const review = await tx.reviewItem.findUnique({ where: { userId_exerciseId: { userId: u.id, exerciseId: ex.id } } });
      if (review) {
        const next = session.mode === "PRACTICE" ? sm2(review, qualityFor(false, firstTry)) : { dueAt: new Date(), lapses: review.lapses + 1 };
        await tx.reviewItem.update({ where: { id: review.id }, data: { ...next, inMistakes: true } });
      } else await tx.reviewItem.create({ data: { userId: u.id, exerciseId: ex.id, lapses: 1, dueAt: new Date() } });
      if (session.mode === "LESSON" && ex.type !== "rubric") {
        const h = loseHeart({ hearts: u.hearts, refillAt: u.heartsRefillAt });
        u = await tx.user.update({ where: { id: u.id }, data: { hearts: h.hearts, heartsRefillAt: h.refillAt } });
        if (h.hearts <= 0) st.outOfHearts = true;
      }
      if (session.mode === "LESSON" && firstTry && !st.outOfHearts) requeue = true;
    }
    st.lastAt = Date.now();
    await tx.playSession.update({ where: { id: session.id }, data: { state: st } });
    const newBadges = await checkBadges(tx, u.id);
    return { xpGained, requeue, questsDone, newBadges, hearts: u.hearts };
  });

  const fresh = await getUsage(user, ip);
  return {
    reveal: reveal(ex, canonical, result, ctx),
    xpGained: out.xpGained,
    combo: st.combo,
    hearts: out.hearts,
    requeue: out.requeue,
    outOfHearts: st.outOfHearts,
    newBadges: badgeInfo(out.newBadges, st.lang),
    questsDone: out.questsDone.map((id) => META.quests.find((q) => q.id === id)!.title[st.lang === "en" ? 1 : 0]),
    usage: serializeUsage(fresh),
  };
}

export function badgeInfo(ids: string[], l: Lang) {
  return ids.map((id) => {
    const b = META.badges.find((x) => x.id === id)!;
    return { id, icon: b.icon, title: b.title[l === "en" ? 1 : 0] };
  });
}

export type Summary = {
  mode: PlayMode;
  completed: boolean;
  failed: boolean;
  xp: number;
  accuracy: number;
  stars?: number;
  gems?: number;
  seconds: number;
  heartGained?: boolean;
  fixed?: number;
  correct: number;
  answered: number;
  comboBest: number;
  blitzRecord?: boolean;
  placement?: { score: number; total: number; skipped: number };
  levelBefore: number;
  levelAfter: number;
  newBadges: { id: string; icon: string; title: string }[];
};

export async function finishSession(user: User, sessionId: string): Promise<Summary> {
  const session = await prisma.playSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== user.id) throw new AppError("NOT_FOUND");
  if (session.finishedAt && session.summary) return session.summary as unknown as Summary;
  const st = session.state as unknown as PlayState;
  const total = session.exerciseIds.length;
  const answeredIds = Object.keys(st.answered).length;
  const seconds = Math.round((Date.now() - session.startedAt.getTime()) / 1000);

  const summary = await prisma.$transaction(async (tx) => {
    const u = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    let extraXp = 0;
    const s: Summary = { mode: session.mode, completed: false, failed: false, xp: st.xp, accuracy: total ? Math.round((st.firstTry / total) * 100) : 0, seconds, correct: st.correct, answered: Object.values(st.answered).reduce((a, b) => a + b, 0), comboBest: st.comboBest, levelBefore: levelFor(st.xp0), levelAfter: 0, newBadges: [] };
    if (session.mode === "LESSON") {
      const finishedAll = session.exerciseIds.every((id) => st.correctIds.includes(id) || (st.answered[id] ?? 0) >= 2);
      if (st.outOfHearts || !finishedAll) s.failed = true;
      else {
        s.completed = true;
        const perfect = st.wrong === 0;
        const bonus = lessonBonus(perfect);
        extraXp = (await awardXp(tx, u, bonus.xp, "LESSON", session.lessonId!)).granted;
        s.stars = starsFor(st.wrong);
        s.gems = bonus.gems;
        await tx.user.update({ where: { id: u.id }, data: { gems: { increment: bonus.gems } } });
        const prev = await tx.progress.findUnique({ where: { userId_lessonId: { userId: u.id, lessonId: session.lessonId! } } });
        await tx.progress.upsert({
          where: { userId_lessonId: { userId: u.id, lessonId: session.lessonId! } },
          create: { userId: u.id, lessonId: session.lessonId!, done: true, stars: s.stars, runs: 1, bestAccuracy: s.accuracy, completedAt: new Date() },
          update: { done: true, stars: Math.max(prev?.stars ?? 0, s.stars), runs: { increment: 1 }, bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, s.accuracy), completedAt: prev?.completedAt ?? new Date() },
        });
        if (perfect) await bumpStats(tx, u.id, (x) => ({ ...x, perfect: x.perfect + 1 }));
        await questEvent(tx, u, "lesson", 1);
      }
    } else if (session.mode === "PRACTICE") {
      s.completed = true;
      s.fixed = st.fixed;
      await bumpStats(tx, u.id, (x) => ({ ...x, practiceSessions: x.practiceSessions + 1 }));
      if (answeredIds >= 3) extraXp = (await awardXp(tx, u, 10, "PRACTICE", session.id)).granted;
      if (answeredIds >= 5 && u.hearts < 5) {
        const h = gainHeart({ hearts: u.hearts, refillAt: u.heartsRefillAt });
        await tx.user.update({ where: { id: u.id }, data: { hearts: h.hearts, heartsRefillAt: h.refillAt } });
        s.heartGained = true;
      }
    } else if (session.mode === "BLITZ") {
      s.completed = true;
      s.blitzRecord = st.correct > u.blitzBest;
      if (s.blitzRecord) await tx.user.update({ where: { id: u.id }, data: { blitzBest: st.correct } });
    } else {
      s.completed = true;
      const th = META.placement.thresholds.filter((t) => t.min <= st.correct).pop()!;
      let skipped = 0;
      for (const lessonId of th.complete) {
        const p = await tx.progress.findUnique({ where: { userId_lessonId: { userId: u.id, lessonId } } });
        if (!p?.done) {
          await tx.progress.upsert({ where: { userId_lessonId: { userId: u.id, lessonId } }, create: { userId: u.id, lessonId, done: true, stars: 1, completedAt: new Date() }, update: { done: true, stars: 1 } });
          skipped++;
        }
      }
      await tx.user.update({ where: { id: u.id }, data: { placementDone: true } });
      s.placement = { score: st.correct, total, skipped };
    }
    s.xp += extraXp;
    const after = await tx.user.findUniqueOrThrow({ where: { id: u.id } });
    s.levelAfter = levelFor(after.xpTotal);
    s.newBadges = badgeInfo(await checkBadges(tx, u.id), st.lang);
    await tx.playSession.update({ where: { id: session.id }, data: { finishedAt: new Date(), summary: s } });
    return s;
  });
  if (summary.mode === "LESSON" && summary.completed) await track("lesson_completed");
  return summary;
}
