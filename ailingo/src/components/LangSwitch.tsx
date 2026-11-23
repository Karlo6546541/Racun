"use client";
import { usePathname, useRouter } from "@/i18n/navigation";
import { updateSettings } from "@/server/actions";

export function LangSwitch({ locale, persist = false }: { locale: string; persist?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const go = async (l: "hr" | "en") => {
    if (persist) await updateSettings({ locale: l }).catch(() => {});
    router.replace(path, { locale: l });
  };
  return (
    <div className="seg2" role="group" aria-label="Language" style={{ maxWidth: 160 }}>
      {(["hr", "en"] as const).map((l) => (
        <button key={l} type="button" aria-pressed={locale === l} onClick={() => go(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
