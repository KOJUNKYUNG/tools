import type { SlideBackground } from "./extractCurrentBackgrounds";

export interface BackgroundGroup {
  /**
   * Dedup key, stable for a deck: the covering backgrounds' group key
   * (`coveringGroupKey`), the imagePath, `colour:` and the swatch for a
   * background without a picture, or "none" for slides with no resolved
   * background.
   */
  key: string;
  source: SlideBackground["source"];
  /** Representative image blob for the preview (first slide in the group). */
  imageBlob: Blob | null;
  /** What the group shows without a picture (first slide in the group). */
  swatch?: SlideBackground["swatch"];
  /** 1-based slide indexes sharing this background, in first-seen order. */
  slideIndexes: number[];
}

/**
 * Collapse per-slide backgrounds into distinct groups. Slides whose covering
 * backgrounds use the same set of picture parts and fills are one group, as
 * are slides whose resolved background image (imagePath) or colour matches;
 * all slides without a background collapse into a single "none" group.
 * First-seen order preserved.
 */
export function groupBackgrounds(bgs: SlideBackground[]): BackgroundGroup[] {
  const byKey = new Map<string, BackgroundGroup>();
  for (const b of bgs) {
    const key = b.coveringKey ?? b.imagePath ?? (b.swatch ? `colour:${b.swatch}` : "none");
    const existing = byKey.get(key);
    if (existing) {
      existing.slideIndexes.push(b.slideIndex);
    } else {
      byKey.set(key, {
        key,
        source: b.source,
        imageBlob: b.imageBlob,
        ...(b.swatch && { swatch: b.swatch }),
        slideIndexes: [b.slideIndex],
      });
    }
  }
  return [...byKey.values()];
}
