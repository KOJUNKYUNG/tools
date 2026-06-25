import "server-only";
import type { Metadata } from "next";
import { getDictionary } from "@/i18n/config";
import { locales, defaultLocale, type Locale } from "@/i18n/locales";
import { TOOLS } from "@/lib/constants";

function asLocale(lang: string): Locale {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : defaultLocale;
}

/** hreflang map → every locale's path for a route, plus x-default → defaultLocale. */
function languageAlternates(path: string): Record<string, string> {
  const langs: Record<string, string> = {};
  for (const l of locales) langs[l] = `/${l}${path}`;
  langs["x-default"] = `/${defaultLocale}${path}`;
  return langs;
}

const OG_LOCALE: Record<Locale, string> = { ko: "ko_KR", en: "en_US" };

/**
 * Per-tool metadata for `generateMetadata`. Title/description come from the i18n
 * dictionary (the single source of tool copy), with optional ToolInfo overrides
 * (`seoDescription`, `keywords`, `ogImage`). Each route — including SEO aliases
 * (pdf-merge, heic-convert, …) — is **self-canonical** (decided 2026-06-25), so
 * an alias ranks for its own intent rather than redirecting to the canonical.
 * `metadataBase` (root layout) resolves the relative URLs to absolute.
 */
export async function buildToolMetadata(slug: string, lang: string): Promise<Metadata> {
  const locale = asLocale(lang);
  const dict = await getDictionary(locale);
  const tool = TOOLS.find((t) => t.slug === slug);
  const copy = (dict.tools as Record<string, { title: string; description: string }>)[slug];

  const title = copy?.title ?? slug;
  const description = tool?.seoDescription ?? copy?.description ?? "";
  const path = `/tools/${slug}`;
  const url = `/${locale}${path}`;

  return {
    title,
    description,
    keywords: tool?.keywords,
    alternates: {
      canonical: url,
      languages: languageAlternates(path),
    },
    openGraph: {
      type: "website",
      siteName: "Ontab",
      title,
      description,
      url,
      locale: OG_LOCALE[locale],
      ...(tool?.ogImage ? { images: [tool.ogImage] } : {}),
    },
  };
}
