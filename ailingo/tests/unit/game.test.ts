import { describe, expect, it } from "vitest";
import { sm2 } from "@/lib/srs/sm2";
import { answerXp, levelFor, levelStart, starsFor } from "@/lib/game/xp";
import { touchStreak, visibleStreak } from "@/lib/game/streak";
import { gainHeart, HEART_MS, loseHeart, tickHearts } from "@/lib/game/hearts";
import { botXp, pickBots, rank, tierChange } from "@/lib/game/leagues";
import { questStep } from "@/lib/game/quests";
import { earnedBadges, readStats, statValue, EMPTY_STATS } from "@/lib/game/stats";

describe("SM-2", () => {
  const s0 = { ease: 2.5, intervalDays: 0, repetitions: 0, lapses: 0, dueAt: new Date(0) };
  const now = new Date("2026-01-01T00:00:00Z");
  it("grows intervals 1 → 6 → ease×6 on good answers", () => {
    const a = sm2(s0, 4, now);
    const b = sm2(a, 4, now);
    const c = sm2(b, 4, now);
    expect([a.intervalDays, b.intervalDays, c.intervalDays]).toEqual([1, 6, Math.round(6 * b.ease)]);
    expect(a.dueAt.getTime() - now.getTime()).toBe(864e5);
  });
  it("resets on a lapse and never drops ease below 1.3", () => {
    let s = sm2(sm2(s0, 5, now), 5, now);
    for (let i = 0; i < 20; i++) s = sm2(s, 0, now);
    expect(s.repetitions).toBe(0);
    expect(s.intervalDays).toBe(1);
    expect(s.lapses).toBe(20);
    expect(s.ease).toBe(1.3);
  });
});

describe("XP and levels", () => {
  it("levels follow 75·n·(n−1)", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(149)).toBe(1);
    expect(levelFor(levelStart(2))).toBe(2);
    expect(levelFor(levelStart(5) + 1)).toBe(5);
  });
  it("awards XP by mode, retry, combo and rubric score", () => {
    expect(answerXp({ mode: "LESSON", firstTry: true, combo: 1 })).toBe(10);
    expect(answerXp({ mode: "LESSON", firstTry: false, combo: 1 })).toBe(5);
    expect(answerXp({ mode: "LESSON", firstTry: true, combo: 3 })).toBe(13);
    expect(answerXp({ mode: "BLITZ", firstTry: true, combo: 0 })).toBe(5);
    expect(answerXp({ mode: "PLACEMENT", firstTry: true, combo: 9 })).toBe(0);
    expect(answerXp({ mode: "LESSON", firstTry: true, combo: 1, rubricScore: 100 })).toBe(10);
    expect(answerXp({ mode: "LESSON", firstTry: true, combo: 1, rubricScore: 60 })).toBe(8);
    expect([starsFor(0), starsFor(2), starsFor(3)]).toEqual([3, 2, 1]);
  });
});

describe("streak", () => {
  const s = { current: 4, longest: 6, lastActiveDay: "2026-03-10" };
  it("continues the next day and keeps the same day idempotent", () => {
    expect(touchStreak(s, "2026-03-11", 0).streak.current).toBe(5);
    expect(touchStreak(s, "2026-03-10", 0).streak).toEqual(s);
  });
  it("uses one Streak Freeze for exactly one missed day", () => {
    const r = touchStreak(s, "2026-03-12", 1);
    expect(r.streak.current).toBe(5);
    expect(r.freezes).toBe(0);
    expect(r.usedFreeze).toBe(true);
    expect(touchStreak(s, "2026-03-13", 2).streak.current).toBe(1);
    expect(touchStreak(s, "2026-03-12", 0).streak.current).toBe(1);
  });
  it("shows 0 when the streak is already broken", () => {
    expect(visibleStreak(s, "2026-03-11", 0)).toBe(4);
    expect(visibleStreak(s, "2026-03-12", 0)).toBe(0);
    expect(visibleStreak(s, "2026-03-12", 1)).toBe(4);
  });
});

describe("hearts", () => {
  const t0 = new Date("2026-01-01T10:00:00Z");
  it("refills one heart every 30 minutes up to 5", () => {
    const h = loseHeart(loseHeart({ hearts: 5, refillAt: null }, t0), t0);
    expect(h.hearts).toBe(3);
    expect(tickHearts(h, new Date(t0.getTime() + HEART_MS)).hearts).toBe(4);
    expect(tickHearts(h, new Date(t0.getTime() + 10 * HEART_MS))).toEqual({ hearts: 5, refillAt: null });
  });
  it("practice gives one back and never exceeds 5", () => {
    expect(gainHeart({ hearts: 2, refillAt: t0 }, t0).hearts).toBe(3);
    expect(gainHeart({ hearts: 5, refillAt: null }, t0).hearts).toBe(5);
    expect(loseHeart({ hearts: 0, refillAt: t0 }, t0).hearts).toBe(0);
  });
});

describe("leagues", () => {
  it("bot XP is deterministic and grows through the week", () => {
    expect(botXp("Ana", "2026-03-09", 1, 0.5)).toBe(botXp("Ana", "2026-03-09", 1, 0.5));
    expect(botXp("Ana", "2026-03-09", 1, 0.2)).toBeLessThanOrEqual(botXp("Ana", "2026-03-09", 1, 0.9));
    expect(botXp("Ana", "2026-03-09", 1, 0)).toBe(0);
  });
  it("picks distinct bots", () => {
    const names = Array.from({ length: 40 }, (_, i) => "b" + i);
    const p = pickBots(names, "2026-03-09", 0, 29);
    expect(new Set(p).size).toBe(29);
  });
  it("ranks by XP, real users before bots on ties", () => {
    const r = rank([{ id: "1", name: "bot", xp: 50, isBot: true, avatar: "" }, { id: "2", name: "me", xp: 50, isBot: false, avatar: "" }, { id: "3", name: "z", xp: 90, isBot: true, avatar: "" }]);
    expect(r.map((x) => x.id)).toEqual(["3", "2", "1"]);
  });
  it("promotes top 10, demotes bottom 5, ignores inactive users", () => {
    expect(tierChange(3, 100, 1, 4)).toBe(1);
    expect(tierChange(3, 100, 4, 4)).toBe(0);
    expect(tierChange(28, 10, 2, 4)).toBe(-1);
    expect(tierChange(28, 10, 0, 4)).toBe(0);
    expect(tierChange(29, 0, 2, 4)).toBe(0);
    expect(tierChange(15, 50, 2, 4)).toBe(0);
  });
});

describe("quests and badges", () => {
  it("advances add and max quests and completes once", () => {
    expect(questStep({ id: "a", target: 3, reward: 10, mode: "add" }, 1, 1)).toEqual({ progress: 2, completed: false });
    expect(questStep({ id: "a", target: 3, reward: 10, mode: "add" }, 2, 5)).toEqual({ progress: 3, completed: true });
    expect(questStep({ id: "a", target: 3, reward: 10, mode: "add" }, 3, 1)).toBeNull();
    expect(questStep({ id: "c", target: 5, reward: 10, mode: "max" }, 3, 2)).toBeNull();
    expect(questStep({ id: "c", target: 5, reward: 10, mode: "max" }, 3, 6)).toEqual({ progress: 5, completed: true });
  });
  it("evaluates badge rules", () => {
    const ctx = { stats: { ...EMPTY_STATS, halluc: 3 }, streakBest: 7, xpTotal: 10, friends: 0, lessonsDone: 1, unitDone: (id: string) => id === "unit-1", trackDone: () => false };
    expect(statValue("halluc", ctx)).toBe(3);
    expect(statValue("unit:unit-1", ctx)).toBe(1);
    const got = earnedBadges([{ id: "h", rule: { stat: "halluc", gte: 3 } }, { id: "s", rule: { stat: "streakBest", gte: 7 } }, { id: "x", rule: { stat: "xpTotal", gte: 500 } }], new Set(["s"]), ctx);
    expect(got).toEqual(["h"]);
    expect(readStats({ correct: 4, junk: "x" }).correct).toBe(4);
  });
});
