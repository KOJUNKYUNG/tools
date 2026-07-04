import type { SlideBackground } from "./extractCurrentBackgrounds";

export interface BackgroundGroup {
  /** Dedup key: imagePath, or "none" for slides with no resolved background. */
  key: string;
  source: SlideBackground["source"];
  /** Representative image blob for the preview (first slide in the group). */
  imageBlob: Blob | null;
  /** 1-based slide indexes sharing this background, in first-seen order. */
  slideIndexes: number[];
}

/**
 * Collapse per-slide backgrounds into distinct groups. Slides whose resolved
 * background image (imagePath) matches are one group; all source==="none"
 * slides collapse into a single "none" group. First-seen order preserved.
 */
export function groupBackgrounds(bgs: SlideBackground[]): BackgroundGroup[] {
  const byKey = new Map<string, BackgroundGroup>();
  for (const b of bgs) {
    const key = b.source === "none" || !b.imagePath ? "none" : b.imagePath;
    const existing = byKey.get(key);
    if (existing) {
      existing.slideIndexes.push(b.slideIndex);
    } else {
      byKey.set(key, {
        key,
        source: b.source,
        imageBlob: b.imageBlob,
        slideIndexes: [b.slideIndex],
      });
    }
  }
  return [...byKey.values()];
}
