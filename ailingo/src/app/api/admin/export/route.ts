import { requireAdmin } from "@/server/viewer";
import { getContent, invalidateContent } from "@/server/content";
import { jsonError } from "@/server/errors";

/** Exports the current (possibly admin-edited) content back to the JSON layout used in content/. */
export async function GET() {
  try {
    await requireAdmin();
    invalidateContent();
    const { units } = await getContent();
    const files = units.map((u) => ({ id: u.id, key: u.key, track: u.track, level: u.level, icon: u.icon, color: u.color, published: u.published, title: u.title, summary: u.summary, lessons: u.lessons.map((l) => ({ id: l.id, title: l.title, exercises: l.exercises })) }));
    return new Response(JSON.stringify(files, null, 1), { headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="ailingo-content.json"' } });
  } catch (e) {
    return jsonError(e);
  }
}
