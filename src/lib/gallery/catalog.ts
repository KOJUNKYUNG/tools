import type { GalleryCategory, GalleryImage, GallerySource } from "./types";

/**
 * The background gallery: local files under `public/gallery/{category}/`, so
 * picking one never reaches another host (the gallery is local-only, see
 * CONTEXT.md non-goals). `scripts/gallery/build.mjs` makes the files;
 * `catalog.test.ts` holds every entry to the quality bar.
 */

const OWN: GallerySource = { kind: "own" };

function image(
  category: GalleryCategory,
  name: string,
  fields: { ext?: "jpg" | "svg"; width?: number; height?: number; source: GallerySource; tags?: string[] },
): GalleryImage {
  const { ext = "jpg", width = 2560, height = 1440, ...rest } = fields;
  return {
    id: `${category}-${name}`,
    category,
    url: `/gallery/${category}/${name}.${ext}`,
    thumbnailUrl: `/gallery/${category}/${name}-thumb.jpg`,
    width,
    height,
    ...rest,
  };
}

/** Made before the gallery spec at 1920 × 1080; kept at that size, never enlarged. */
const LEGACY_SIZE = { width: 1920, height: 1080 };

export const GALLERY_IMAGES: GalleryImage[] = [
  image("gradient", "green", { ...LEGACY_SIZE, source: OWN, tags: ["soft", "blue", "green"] }),
  image("gradient", "red", { ...LEGACY_SIZE, source: OWN, tags: ["warm", "red"] }),
  image("gradient", "yellow", { ...LEGACY_SIZE, source: OWN, tags: ["warm", "yellow"] }),
];
