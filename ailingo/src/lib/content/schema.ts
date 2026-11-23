import { z } from "zod";

/** Bilingual text: [hr, en]. */
export const T = z.tuple([z.string().trim().min(1), z.string().trim().min(1)]);
export type Txt = z.infer<typeof T>;

const base = { id: z.string().optional(), q: T, explain: T };
const idx = z.number().int().min(0);

const Mc = z.object({ ...base, type: z.literal("mc"), options: z.array(T).min(2).max(4), answer: idx });
const Tf = z.object({ ...base, type: z.literal("tf"), answer: z.boolean() });
const Fill = z.object({
  ...base,
  type: z.literal("fill"),
  answers: z.object({ hr: z.array(z.string().min(1)).min(1), en: z.array(z.string().min(1)).min(1) }),
});
const Build = z.object({ ...base, type: z.literal("build"), slots: z.array(T).min(3).max(7), parts: z.array(T).min(3).max(7) });
const Match = z.object({ ...base, type: z.literal("match"), pairs: z.array(z.tuple([T, T])).min(3).max(5) });
const Doctor = z.object({
  ...base,
  type: z.literal("doctor"),
  bad: T,
  options: z.array(z.object({ t: T, why: T })).min(2).max(4),
  answer: idx,
});
const Criterion = z.object({
  id: z.string().min(1),
  pts: z.number().int().positive(),
  label: T,
  kw: z.object({ hr: z.array(z.string().min(1)).min(1), en: z.array(z.string().min(1)).min(1) }),
  hint: T,
});
const Rubric = z.object({
  ...base,
  type: z.literal("rubric"),
  rubric: z.object({
    minWords: z.number().int().positive(),
    lenPts: z.number().int().min(0),
    vaguePts: z.number().int().min(0),
    pass: z.number().int().min(1).max(100),
    criteria: z.array(Criterion).min(1),
    vague: z.object({ hr: z.array(z.string()), en: z.array(z.string()) }),
    model: T,
  }),
});
const Spot = z.object({ ...base, type: z.literal("spot"), segments: z.array(T).min(2).max(6), bad: idx });
const Compare = z.object({ ...base, type: z.literal("compare"), a: T, b: T, answer: z.union([z.literal(0), z.literal(1)]) });
const Order = z.object({ ...base, type: z.literal("order"), steps: z.array(T).min(3).max(7) });

export const ExerciseSchema = z
  .discriminatedUnion("type", [Mc, Tf, Fill, Build, Match, Doctor, Rubric, Spot, Compare, Order])
  .superRefine((e, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if ((e.type === "mc" || e.type === "doctor") && e.answer >= e.options.length) bad("answer index out of range");
    if (e.type === "spot" && e.bad >= e.segments.length) bad("bad index out of range");
    if (e.type === "build" && e.slots.length !== e.parts.length) bad("slots and parts must have equal length");
    if (e.type === "fill" && !(e.q[0].includes("___") && e.q[1].includes("___"))) bad("fill question needs ___ in both languages");
    if (e.type === "rubric") {
      const r = e.rubric;
      const sum = r.lenPts + r.vaguePts + r.criteria.reduce((a, c) => a + c.pts, 0);
      if (sum !== 100) bad(`rubric points sum to ${sum}, need 100`);
    }
  });
export type Exercise = z.infer<typeof ExerciseSchema> & { id: string };
export type ExerciseType = Exercise["type"];
export const EXERCISE_TYPES = ["mc", "tf", "fill", "build", "match", "doctor", "rubric", "spot", "compare", "order"] as const;

export const LessonSchema = z
  .object({ id: z.string().optional(), title: T, exercises: z.array(ExerciseSchema).min(8).max(12) })
  .superRefine((l, ctx) => {
    if (new Set(l.exercises.map((e) => e.type)).size < 3)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "lesson needs at least 3 exercise types" });
  });

export const UnitSchema = z.object({
  id: z.string().min(1),
  key: z.string().optional(),
  order: z.number().int().optional(),
  track: z.enum(["ai", "mk"]).optional(),
  level: z.number().int().min(1).max(3).optional(),
  icon: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  published: z.boolean().optional(),
  title: T,
  summary: T,
  lessons: z.array(LessonSchema).min(1),
});

const Rule = z.object({ stat: z.string().min(1), gte: z.number().int().positive() });
export const MetaSchema = z.object({
  unitFiles: z.array(z.string().min(1)).min(1),
  tracks: z.array(z.object({ id: z.enum(["ai", "mk"]), icon: z.string(), title: T, order: z.array(z.string()).min(1) })).min(1),
  levels: z.array(T).length(3),
  unitDefaults: z.record(z.object({ track: z.enum(["ai", "mk"]), level: z.number().int().min(1).max(3) })),
  placement: z.object({
    exercises: z.array(z.string()).min(4),
    thresholds: z.array(z.object({ min: z.number().int().min(0), complete: z.array(z.string()) })).min(1),
  }),
  quests: z.array(z.object({ id: z.string(), target: z.number().int().positive(), reward: z.number().int().positive(), mode: z.enum(["add", "max"]), title: T })).min(1),
  badges: z.array(z.object({ id: z.string(), icon: z.string(), title: T, desc: T, rule: Rule })).min(1),
  tiers: z.array(z.object({ name: T, icon: z.string() })).min(2),
  bots: z.array(z.string().min(1)).min(30),
  avatars: z.array(z.string().min(1)).min(1),
});
export type Meta = z.infer<typeof MetaSchema>;

export type Lesson = { id: string; title: Txt; exercises: Exercise[] };
export type Unit = {
  id: string;
  key: string;
  track: "ai" | "mk";
  level: number;
  position: number;
  icon: string;
  color: string;
  published: boolean;
  title: Txt;
  summary: Txt;
  lessons: Lesson[];
};
