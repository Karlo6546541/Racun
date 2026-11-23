import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { getViewer } from "@/server/viewer";
import { getContent } from "@/server/content";
import { toClient } from "@/lib/grading/present";
import { AdminEditor } from "@/components/Admin";

export default async function EditExercise({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const v = await getViewer();
  if (v?.role !== "ADMIN") redirect({ href: "/", locale });
  const t = await getTranslations("admin");
  const info = (await getContent()).exercises.get(id);
  if (!info) notFound();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _omit, ...payload } = info.ex;
  const preview = toClient(info.ex, { secret: "preview", sessionId: "preview", lang: locale === "en" ? "en" : "hr" });
  return (
    <main className="wrap" style={{ paddingTop: 20, paddingBottom: 40 }}>
      <Link href="/admin">← {t("title")}</Link>
      <h2 style={{ margin: "10px 0" }}>
        {id} · {info.ex.type}
      </h2>
      <AdminEditor id={id} initial={JSON.stringify(payload, null, 2)} preview={preview} previewLabel={t("preview")} />
    </main>
  );
}
