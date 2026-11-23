import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/server/viewer";
import { Onboarding } from "@/components/Onboarding";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const v = await getViewer();
  if (v?.onboarded) redirect({ href: "/learn", locale });
  return (
    <main className="wrap" style={{ paddingTop: 20, paddingBottom: 40 }}>
      <Onboarding locale={locale} defaultName={v?.name ?? ""} />
    </main>
  );
}
