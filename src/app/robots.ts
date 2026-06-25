import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo/site";

/** Allow all crawlers; point them at the sitemap. Everything is public. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
