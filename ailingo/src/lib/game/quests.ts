export type QuestDef = { id: string; target: number; reward: number; mode: "add" | "max" };

/** New progress after an event. Returns null when nothing changes. */
export function questStep(def: QuestDef, progress: number, value: number): { progress: number; completed: boolean } | null {
  if (progress >= def.target) return null;
  const next = Math.min(def.target, def.mode === "max" ? Math.max(progress, value) : progress + value);
  if (next === progress) return null;
  return { progress: next, completed: next >= def.target };
}
