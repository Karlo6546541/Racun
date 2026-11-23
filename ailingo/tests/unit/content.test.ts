import { describe, expect, it } from "vitest";
import { loadContentFromDisk } from "@/lib/content/disk";
import { buildContent } from "@/lib/content/normalize";
import { ExerciseSchema } from "@/lib/content/schema";

describe("content", () => {
  const { units, issues, meta } = loadContentFromDisk();
  it("is valid", () => expect(issues).toEqual([]));
  it("has both tracks, 46 lessons and 368 exercises", () => {
    expect(new Set(units.map((u) => u.track))).toEqual(new Set(["ai", "mk"]));
    expect(units.reduce((a, u) => a + u.lessons.length, 0)).toBe(46);
    expect(units.reduce((a, u) => a + u.lessons.reduce((b, l) => b + l.exercises.length, 0), 0)).toBe(368);
  });
  it("orders units by track order from meta.json", () => {
    for (const t of meta.tracks) expect(units.filter((u) => u.track === t.id).map((u) => u.id)).toEqual(t.order);
  });
  it("rejects a rubric whose points do not sum to 100", () => {
    const bad = { type: "rubric", q: ["a", "b"], explain: ["a", "b"], rubric: { minWords: 3, lenPts: 10, vaguePts: 10, pass: 60, criteria: [{ id: "x", pts: 50, label: ["a", "b"], kw: { hr: ["a"], en: ["a"] }, hint: ["a", "b"] }], vague: { hr: [], en: [] }, model: ["a", "b"] } };
    expect(ExerciseSchema.safeParse(bad).success).toBe(false);
  });
  it("reports unknown units in a track", () => {
    const { issues } = buildContent({ ...meta, tracks: [{ ...meta.tracks[0], order: ["nope"] }] }, {});
    expect(issues.some((i) => i.message.includes("nope"))).toBe(true);
  });
});
