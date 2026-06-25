import type { MetadataRoute } from "next";
import { TOOLS } from "@/lib/constants";
import { locales } from "@/i18n/locales";
import { siteUrl } from "@/lib/seo/site";

/**
 * Registry-derived sitemap. Every locale of the landing and of each tool route
 * — canonical AND live SEO aliases (pdf-merge, heic-convert, …), since each is
 * self-canonical — with hreflang alternates. Sitemap URLs must be absolute, so
 * they are composed from `siteUrl` directly (metadataBase does not apply here).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const altLanguages = (path: string): Record<string, string> =>
    Object.fromEntries(locales.map((l) => [l, `${siteUrl}/${l}${path}`]));

  const entries: MetadataRoute.Sitemap = [];

  // Landing, per locale.
  for (const locale of locales) {
    entries.push({
      url: `${siteUrl}/${locale}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
      alternates: { languages: altLanguages("") },
    });
  }

  // Every tool route, per locale (aliases slightly lower priority than canonical).
  for (const tool of TOOLS) {
    const path = `/tools/${tool.slug}`;
    for (const locale of locales) {
      entries.push({
        url: `${siteUrl}/${locale}${path}`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: tool.aliasOf ? 0.6 : 0.8,
        alternates: { languages: altLanguages(path) },
      });
    }
  }

  return entries;
}
