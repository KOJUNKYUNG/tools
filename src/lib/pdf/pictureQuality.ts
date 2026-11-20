// image-to-pdf's picture quality setting (CONTEXT "Picture quality"): how many
// pixels a picture keeps for the page it lands on. Pure, so the engine works
// out each picture's stored size before the preparation draws it.

import { type PixelSize, filledSize } from "@/lib/image/slideImage";
import { type PageSize, SCREEN_PRESETS } from "./pageSize";

/** 원본 그대로, 높게, 보통 (the tool's default). */
export const PICTURE_QUALITIES = ["original", "high", "standard"] as const;
export type PictureQuality = (typeof PICTURE_QUALITIES)[number];

/** Dots per inch across the size a picture is drawn at, on a print preset or custom page. */
const PRINT_DPI = { high: 300, standard: 200 } as const;
/** The screen a screen preset's pictures are sized for (CONTEXT "Screen size"). */
const SCREEN = { high: "4k", standard: "full-hd" } as const;

const isScreenPreset = (pageSize: PageSize) =>
  pageSize.kind === "preset" && SCREEN_PRESETS.some((preset) => preset === pageSize.preset);

/**
 * The pixels a picture keeps per point it is drawn across on `page` (in
 * points, as turned), or null under 원본 그대로, which keeps every pixel.
 * Print presets and custom sizes: the level's dots per inch. Screen presets:
 * the page's rectangle on the level's screen, turned as the page is.
 */
export function pixelsPerPoint(
  pageSize: PageSize,
  page: { width: number; height: number },
  quality: PictureQuality,
): number | null {
  if (quality === "original") return null;
  if (isScreenPreset(pageSize)) {
    return filledSize({ w: page.width, h: page.height }, SCREEN[quality]).width / page.width;
  }
  return PRINT_DPI[quality] / 72;
}

/**
 * The size a picture of `own` pixels drawn `drawn` points (along its own
 * width and height) is stored at: no more than `perPoint` pixels per point,
 * keeping its shape, and never enlarged. Its own size under 원본 그대로
 * (`perPoint` null).
 */
export function keptSize(own: PixelSize, drawn: { width: number; height: number }, perPoint: number | null): PixelSize {
  if (perPoint === null) return own;
  const scale = Math.min(1, (perPoint * drawn.width) / own.width, (perPoint * drawn.height) / own.height);
  if (scale >= 1) return own;
  return {
    width: Math.max(1, Math.round(own.width * scale)),
    height: Math.max(1, Math.round(own.height * scale)),
  };
}
