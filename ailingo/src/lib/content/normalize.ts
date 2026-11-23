import { createHash } from "node:crypto";
import { ExerciseSchema, MetaSchema, UnitSchema, type Exercise, type Meta, type Unit } from "./schema";

export type ContentIssue = { where: string; message: string };

/** Parses raw JSON files into normalized units (ids assigned, track order applied). Pure: no I/O. */
export function buildContent(metaRaw: unknown, files: Record<string, unknown>): { meta: Meta; units: Unit[]; issues: ContentIssue[] } {
  const issues: ContentIssue[] = [];
  const metaParsed = MetaSchema.safeParse(metaRaw);
  if (!metaParsed.success) {
    return { meta: metaRaw as Meta, units: [], issues: metaParsed.error.issues.map((i) => ({ where: "meta.json:" + i.path.join("."), message: i.message })) };
  }
  const meta = metaParsed.data;
  const byId = new Map<string, Unit>();
  for (const file of meta.unitFiles) {
    const data = files[file];
    if (data === undefined) {
      issues.push({ where: file, message: "file missing" });
      continue;
    }
    for (const raw of Array.isArray(data) ? data : [data]) {
      const p = UnitSchema.safeParse(raw);
      if (!p.success) {
        for (const i of p.error.issues) issues.push({ where: `${file}:${(raw as { id?: string })?.id ?? "?"}:${i.path.join(".")}`, message: i.message });
        continue;
      }
      const u = p.data;
      const d = meta.unitDefaults[u.id];
      const track = u.track ?? d?.track;
      const level = u.level ?? d?.level;
      if (!track || !level) {
        issues.push({ where: u.id, message: "unit needs track and level" });
        continue;
      }
      const key = u.key ?? "u" + u.order;
      byId.set(u.id, {
        id: u.id,
        key,
        track,
        level,
        position: 0,
        icon: u.icon,
        color: u.color,
        published: u.published ?? true,
        title: u.title,
        summary: u.summary,
        lessons: u.lessons.map((l, i) => {
          const lid = l.id ?? `${key}l${i + 1}`;
          return { id: lid, title: l.title, exercises: l.exercises.map((e, j) => ({ ...e, id: e.id ?? `${lid}e${j + 1}` }) as Exercise) };
        }),
      });
    }
  }
  const units: Unit[] = [];
  for (const t of meta.tracks) {
    t.order.forEach((id, i) => {
      const u = byId.get(id);
      if (!u) return issues.push({ where: `track ${t.id}`, message: `unknown unit ${id}` });
      if (u.track !== t.id) issues.push({ where: id, message: "track mismatch" });
      units.push({ ...u, position: i + 1 });
    });
  }
  for (const id of byId.keys()) if (!units.some((u) => u.id === id)) issues.push({ where: id, message: "unit is not in any track order" });

  const exIds = new Set<string>();
  const lessonIds = new Set<string>();
  for (const u of units)
    for (const l of u.lessons) {
      if (lessonIds.has(l.id)) issues.push({ where: l.id, message: "duplicate lesson id" });
      lessonIds.add(l.id);
      for (const e of l.exercises) {
        if (exIds.has(e.id)) issues.push({ where: e.id, message: "duplicate exercise id" });
        exIds.add(e.id);
      }
    }
  for (const id of meta.placement.exercises) if (!exIds.has(id)) issues.push({ where: "placement", message: `unknown exercise ${id}` });
  for (const th of meta.placement.thresholds) for (const id of th.complete) if (!lessonIds.has(id)) issues.push({ where: "placement", message: `unknown lesson ${id}` });
  for (const b of meta.badges) {
    const m = b.rule.stat.match(/^unit:(.+)$/);
    if (m && !byId.has(m[1])) issues.push({ where: `badge ${b.id}`, message: `unknown unit ${m[1]}` });
  }
  return { meta, units, issues };
}

export function exerciseHash(e: Exercise): string {
  return createHash("sha256").update(JSON.stringify(e)).digest("hex").slice(0, 16);
}

export function validateExercise(raw: unknown) {
  return ExerciseSchema.safeParse(raw);
}
