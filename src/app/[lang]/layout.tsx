import type { ReactNode } from "react";
import { RunLinesProvider } from "@/components/common/RunLinesProvider";
import { getDictionary, type Locale } from "@/i18n/config";
import { defaultLocale, locales } from "@/i18n/locales";
import { LangSync } from "./lang-sync";

export default async function LangLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  // A path with a dot skips the proxy's redirect, so `lang` may be no locale;
  // the casts are safe because `includes` has just checked it.
  const locale = (locales as readonly string[]).includes(lang) ? (lang as Locale) : defaultLocale;
  const dict = await getDictionary(locale);
  return (
    <>
      <LangSync lang={lang} />
      <RunLinesProvider runLines={dict.common.runLines}>{children}</RunLinesProvider>
    </>
  );
}
