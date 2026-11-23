import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({ locales: ["hr", "en"], defaultLocale: "hr", localePrefix: "as-needed" });
export type Locale = (typeof routing.locales)[number];
