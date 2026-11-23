import { PrismaClient } from "@prisma/client";
import { loadContentFromDisk } from "../src/lib/content/disk";
import { exerciseHash } from "../src/lib/content/normalize";

const prisma = new PrismaClient();

async function main() {
  const { meta, units, issues } = loadContentFromDisk();
  if (issues.length) {
    console.error(issues);
    throw new Error("Content is invalid. Run npm run validate:content.");
  }
  const unitIds = units.map((u) => u.id);
  const lessonIds = units.flatMap((u) => u.lessons.map((l) => l.id));
  const exIds = units.flatMap((u) => u.lessons.flatMap((l) => l.exercises.map((e) => e.id)));

  // Free unique positions before re-numbering.
  await prisma.$executeRawUnsafe(`UPDATE "Exercise" SET position = position + 10000`);
  await prisma.$executeRawUnsafe(`UPDATE "Lesson" SET position = position + 10000`);

  for (const u of units) {
    const data = { key: u.key, track: u.track, level: u.level, position: u.position, title: u.title, summary: u.summary, icon: u.icon, color: u.color, published: u.published };
    await prisma.unit.upsert({ where: { id: u.id }, create: { id: u.id, ...data }, update: data });
    for (const [li, l] of u.lessons.entries()) {
      await prisma.lesson.upsert({ where: { id: l.id }, create: { id: l.id, unitId: u.id, position: li + 1, title: l.title }, update: { unitId: u.id, position: li + 1, title: l.title } });
      for (const [ei, e] of l.exercises.entries()) {
        const d = { lessonId: l.id, position: ei + 1, type: e.type, payload: e as object, contentHash: exerciseHash(e) };
        await prisma.exercise.upsert({ where: { id: e.id }, create: { id: e.id, ...d }, update: d });
      }
    }
  }
  await prisma.exercise.deleteMany({ where: { id: { notIn: exIds } } });
  await prisma.lesson.deleteMany({ where: { id: { notIn: lessonIds } } });
  await prisma.unit.deleteMany({ where: { id: { notIn: unitIds } } });

  for (const b of meta.badges) {
    const d = { icon: b.icon, title: b.title, description: b.desc, rule: b.rule };
    await prisma.badge.upsert({ where: { id: b.id }, create: { id: b.id, ...d }, update: d });
  }
  console.log(`Seeded ${units.length} units, ${lessonIds.length} lessons, ${exIds.length} exercises, ${meta.badges.length} badges.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
