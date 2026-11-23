import { prisma } from "./db";
import type { Exercise, Lesson, Txt, Unit } from "@/lib/content/schema";

type Snapshot = { units: Unit[]; exercises: Map<string, { ex: Exercise; lesson: Lesson; unit: Unit }>; lessons: Map<string, { lesson: Lesson; unit: Unit }> };
let cache: { at: number; snap: Snapshot } | null = null;
const TTL = 60_000;

export function invalidateContent() {
  cache = null;
}

/** Content from the database (seeded from content/*.json), cached per instance. */
export async function getContent(): Promise<Snapshot> {
  if (cache && Date.now() - cache.at < TTL) return cache.snap;
  const rows = await prisma.unit.findMany({
    orderBy: [{ track: "asc" }, { position: "asc" }],
    include: { lessons: { orderBy: { position: "asc" }, include: { exercises: { orderBy: { position: "asc" } } } } },
  });
  const units: Unit[] = rows.map((u) => ({
    id: u.id,
    key: u.key,
    track: u.track as Unit["track"],
    level: u.level,
    position: u.position,
    icon: u.icon,
    color: u.color,
    published: u.published,
    title: u.title as Txt,
    summary: u.summary as Txt,
    lessons: u.lessons.map((l) => ({ id: l.id, title: l.title as Txt, exercises: l.exercises.map((e) => ({ ...(e.payload as object), id: e.id }) as Exercise) })),
  }));
  const exercises: Snapshot["exercises"] = new Map();
  const lessons: Snapshot["lessons"] = new Map();
  for (const unit of units)
    for (const lesson of unit.lessons) {
      lessons.set(lesson.id, { lesson, unit });
      for (const ex of lesson.exercises) exercises.set(ex.id, { ex, lesson, unit });
    }
  const snap = { units, exercises, lessons };
  cache = { at: Date.now(), snap };
  return snap;
}

export function trackLessons(units: Unit[], track: string) {
  return units.filter((u) => u.track === track && u.published).flatMap((u) => u.lessons.map((l) => ({ unit: u, lesson: l })));
}

export type LessonState = "locked" | "open" | "done";

/** Lessons unlock in order within their own track. */
export function lessonStates(units: Unit[], done: Set<string>): Map<string, LessonState> {
  const out = new Map<string, LessonState>();
  for (const track of ["ai", "mk"]) {
    const list = trackLessons(units, track);
    list.forEach((x, i) => out.set(x.lesson.id, done.has(x.lesson.id) ? "done" : i === 0 || done.has(list[i - 1].lesson.id) ? "open" : "locked"));
  }
  for (const u of units) if (!u.published) for (const l of u.lessons) out.set(l.id, "locked");
  return out;
}
