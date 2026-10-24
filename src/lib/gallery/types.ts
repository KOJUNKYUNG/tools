export type GalleryCategory = "gradient" | "nature" | "texture" | "pattern";

export const GALLERY_CATEGORIES: GalleryCategory[] = [
  "gradient",
  "nature",
  "texture",
  "pattern",
];

/**
 * Where a gallery image comes from. The repo is public, so only images we may
 * redistribute without conditions are allowed: our own work, or CC0 / public
 * domain with the original page recorded for `CREDITS.md`.
 */
export type GallerySource =
  | { kind: "own" }
  | {
      kind: "cc0";
      /** The original's page, where its licence was checked. */
      url: string;
      author: string;
      license: "CC0 1.0" | "Public domain";
      /** ISO date the original was downloaded. */
      retrieved: string;
    };

export interface GalleryImage {
  id: string;
  category: GalleryCategory;
  /** Display title. Not i18n'd at the mock stage; revisit when Supabase lands. */
  title: string;
  /** Site path of the original under `public/`. */
  url: string;
  /** Site path of the 480 × 270 JPEG thumbnail under `public/`. */
  thumbnailUrl: string;
  width: number;
  height: number;
  source: GallerySource;
  /** Future search. Not surfaced in UI in this PR. */
  tags?: string[];
}
