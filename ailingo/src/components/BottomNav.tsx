"use client";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const ITEMS = [
  ["/learn", "🏠", "learn"],
  ["/practice", "💪", "practice"],
  ["/leagues", "🏆", "leagues"],
  ["/friends", "👥", "friends"],
  ["/profile", "👤", "profile"],
] as const;

export function BottomNav() {
  const t = useTranslations("nav");
  const path = usePathname();
  return (
    <nav className="nav" aria-label={t("label")}>
      <div>
        {ITEMS.map(([href, icon, key]) => (
          <Link key={href} href={href} aria-current={path.startsWith(href) || (href === "/profile" && path.startsWith("/settings")) ? "page" : undefined}>
            <span aria-hidden="true">{icon}</span>
            {t(key)}
          </Link>
        ))}
      </div>
    </nav>
  );
}
