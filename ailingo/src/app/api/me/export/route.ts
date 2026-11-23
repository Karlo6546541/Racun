import { requireViewer } from "@/server/viewer";
import { exportUserData } from "@/server/gdpr";
import { jsonError } from "@/server/errors";

export async function GET() {
  try {
    const user = await requireViewer();
    const data = await exportUserData(user.id);
    return new Response(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="ailingo-data-${new Date().toISOString().slice(0, 10)}.json"` } });
  } catch (e) {
    return jsonError(e);
  }
}
