import { loadContentFromDisk } from "../src/lib/content/disk";
import { EXERCISE_TYPES } from "../src/lib/content/schema";

const { units, issues } = loadContentFromDisk();
const types = new Set(units.flatMap((u) => u.lessons.flatMap((l) => l.exercises.map((e) => e.type))));
for (const t of EXERCISE_TYPES) if (!types.has(t)) issues.push({ where: "content", message: `no exercise of type ${t}` });

if (issues.length) {
  console.error(`✗ Content invalid (${issues.length} issues):`);
  for (const i of issues) console.error(` - ${i.where}: ${i.message}`);
  process.exit(1);
}
const lessons = units.reduce((a, u) => a + u.lessons.length, 0);
const exercises = units.reduce((a, u) => a + u.lessons.reduce((b, l) => b + l.exercises.length, 0), 0);
console.log(`✓ Content valid: ${units.length} units, ${lessons} lessons, ${exercises} exercises, ${types.size}/10 types`);
