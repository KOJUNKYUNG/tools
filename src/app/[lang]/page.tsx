import type { Metadata } from "next";
import { getDictionary, type Locale } from "@/i18n/config";
import { locales, defaultLocale } from "@/i18n/locales";
import { InteractiveLanding } from "@/components/landing/InteractiveLanding";

function asLocale(lang: string): Locale {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : defaultLocale;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const locale = asLocale(lang);
  const dict = await getDictionary(locale);
  const title = `Ontab — ${dict.brand.tagline}`;

  const languages: Record<string, string> = {};
  for (const l of locales) languages[l] = `/${l}`;
  languages["x-default"] = `/${defaultLocale}`;

  return {
    title: { absolute: title },
    description: dict.brand.tagline,
    alternates: { canonical: `/${locale}`, languages },
    openGraph: {
      type: "website",
      siteName: "Ontab",
      title,
      description: dict.brand.tagline,
      url: `/${locale}`,
      locale: locale === "ko" ? "ko_KR" : "en_US",
    },
  };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  return <InteractiveLanding locale={lang as "ko" | "en"} dict={dict} />;
}
