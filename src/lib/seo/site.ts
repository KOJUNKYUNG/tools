/**
 * Canonical site origin for SEO artifacts (metadataBase, canonical/alternate
 * URLs, sitemap, robots). Resolved once, in priority order:
 *
 *  1. NEXT_PUBLIC_SITE_URL — set this to the real domain in prod (.env / Vercel).
 *  2. VERCEL_PROJECT_PRODUCTION_URL — Vercel's stable production domain, so a
 *     deploy gets correct absolute URLs with zero config.
 *  3. http://localhost:3000 — local dev fallback.
 *
 * No trailing slash. Set NEXT_PUBLIC_SITE_URL once a custom domain exists.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

export const siteUrl = resolveSiteUrl();
