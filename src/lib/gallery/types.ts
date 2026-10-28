export type GalleryCategory = "gradient" | "nature" | "texture" | "pattern";

/** The gallery's tabs, in order; "전체" lists the images in the same order. */
export const GALLERY_CATEGORIES: GalleryCategory[] = [
  "gradient",
  "pattern",
  "texture",
  "nature",
];

/**
 * Where a gallery image comes from. The repo is public, so only images we may
 * redistribute without conditions are allowed: our own work, or CC0 with the
 * original page recorded for `CREDITS.md`.
 */
export type GallerySource =
  /** Made for Ontab before the gallery spec; the committed file is the original. */
  | { kind: "own" }
  /** Drawn with Paper Shaders from the recipe of the same name in `scripts/gallery/shaders.json`. */
  | { kind: "paper" }
  | {
      kind: "cc0";
      /** The original's page, where its licence was checked. */
      url: string;
      author: string;
      license: "CC0 1.0";
      /** ISO date the original was downloaded. */
      retrieved: string;
    };

export interface GalleryImage {
  id: string;
  category: GalleryCategory;
  /** File name without extension, unique within the category; names the build source and recipe. */
  name: string;
  /** JPEG, or PNG where lossless is smaller (pixel art). */
  format: "jpeg" | "png";
  /** Site path of the original under `public/`. */
  url: string;
  /** Site path of the 480 × 270 JPEG thumbnail under `public/`. */
  thumbnailUrl: string;
  width: number;
  height: number;
  source: GallerySource;
}
