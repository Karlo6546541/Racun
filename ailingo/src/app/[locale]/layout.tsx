import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SwRegister } from "@/components/SwRegister";

/** Every page depends on the signed-in viewer or guest cookie. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: { default: t("title"), template: "%s · AIlingo" }, description: t("description"), manifest: "/manifest.webmanifest", icons: { icon: "/icon.svg", apple: "/icon-192.png" } };
}

export const viewport: Viewport = { themeColor: "#58cc02", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&display=swap" />
      </head>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <SwRegister />
      </body>
    </html>
  );
}
