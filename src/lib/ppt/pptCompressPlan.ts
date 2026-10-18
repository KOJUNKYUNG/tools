import type { CompressionPreset } from "@/lib/common/compressionPreset";

/**
 * Re-encode quality (0..1) per preset: the JPEG quality, and for PNG the colour
 * budget (browser-image-compression quantizes to 4096 × quality colours).
 */
export const PRESET_QUALITY: Record<CompressionPreset, number> = {
  low: 0.82,
  medium: 0.7,
  high: 0.55,
};

/** Extensions we attempt to recompress. Everything else passes through. */
export const RECOMPRESSIBLE_EXTS = new Set(["jpg", "jpeg", "png"]);

export type MediaAction =
  | { kind: "jpeg"; quality: number }
  | { kind: "png"; quality: number }
  | { kind: "passthrough" };

/**
 * Decide how to handle one media entry. We never change the container format
 * (jpeg stays jpeg, png stays png) so the media filename, slide rels, and
 * [Content_Types].xml stay byte-stable and PowerPoint always opens the output.
 */
export function classifyMedia(
  ext: string,
  preset: CompressionPreset,
): MediaAction {
  const e = ext.toLowerCase();
  const quality = PRESET_QUALITY[preset];
  if (e === "jpg" || e === "jpeg") return { kind: "jpeg", quality };
  if (e === "png") return { kind: "png", quality };
  return { kind: "passthrough" };
}

export interface ChosenBytes {
  bytes: Uint8Array;
  usedCandidate: boolean;
}

/**
 * Keep the re-encoded candidate only when it is strictly smaller than the
 * original. A null candidate means re-encoding failed — keep the original.
 */
export function pickSmaller(
  original: Uint8Array,
  candidate: Uint8Array | null,
): ChosenBytes {
  if (!candidate || candidate.length >= original.length) {
    return { bytes: original, usedCandidate: false };
  }
  return { bytes: candidate, usedCandidate: true };
}

/**
 * Build the download filename for a compressed PPTX.
 * `"deck.pptx"` -> `"deck-compressed.pptx"`; `""` -> `"compressed.pptx"`.
 */
export function deriveCompressedName(originalName: string): string {
  if (!originalName) return "compressed.pptx";
  const lower = originalName.toLowerCase();
  const base = lower.endsWith(".pptx")
    ? originalName.slice(0, -5)
    : originalName;
  return `${base}-compressed.pptx`;
}

/**
 * Fraction of JPEG bytes left after re-encoding at each preset. Lossy, so the
 * quality knob (preset) has a real effect here.
 */
export const PRESET_JPEG_RATIO: Record<CompressionPreset, number> = {
  low: 0.78,
  medium: 0.58,
  high: 0.42,
};

/**
 * Fraction of PNG bytes left after re-encoding at each preset. The re-encode
 * quantizes to 4096 × quality colours, so it is lossy and a stronger preset
 * does shrink more, but only a little: measured with browser-image-compression
 * 2.0.2 on the 31 PNGs of the real-file decks (2026-10), with each image kept
 * when its candidate is no smaller, as the engine does.
 */
export const PRESET_PNG_RATIO: Record<CompressionPreset, number> = {
  low: 0.64,
  medium: 0.62,
  high: 0.59,
};

/** Whole-file [min,max] remaining range used as a static fallback estimate. */
export const PRESET_RANGE: Record<CompressionPreset, [number, number]> = {
  low: [0.7, 0.98],
  medium: [0.55, 0.9],
  high: [0.45, 0.8],
};

/**
 * Minimum recompressible-share before the derived estimate is shown.
 * Below the cutoff we display "~ original size" instead of a misleading number.
 */
const PRESET_IMAGE_SHARE_CUTOFF: Record<CompressionPreset, number> = {
  low: 0.15,
  medium: 0.05,
  high: 0.03,
};

/** One recompressible image, as the idle-time analysis read it. */
export type MediaSample =
  | {
      kind: "jpeg";
      bytes: number;
      /** Estimated save quality (1–100) from its quantization tables; null if unreadable. */
      quality: number | null;
    }
  | {
      kind: "png";
      bytes: number;
      /** Indexed colour (IHDR colour type 3). */
      palette: boolean;
      /** Distinct colors, counted up to past every preset's budget; null if not counted. */
      colors: number | null;
    };

/**
 * The colour budget a preset's PNG re-encode quantizes to: browser-image-
 * compression keeps at most 4096 × quality colours.
 */
export function pngColorBudget(preset: CompressionPreset): number {
  return 4096 * PRESET_QUALITY[preset];
}

/**
 * A JPEG this many quality points above the preset's still counts as already
 * compressed: re-encoding it gains little, and the quality estimate of the
 * engine's own output can read a point or two off.
 */
const JPEG_QUALITY_MARGIN = 5;

/**
 * Whether re-encoding at `preset` is unlikely to shrink the image: a JPEG
 * already saved at about the preset's quality or lower, or a PNG already
 * reduced to a palette or to within the preset's colour budget (the engine's
 * own output has at most that many colours but stays RGBA). Such an image is
 * expected to keep its size, since the engine keeps the original when the
 * re-encode is no smaller (#78). Compared against the chosen preset only: a
 * deck compressed at one preset and re-run at a stronger one still counts as
 * fresh, so that case can over-promise.
 */
export function looksAlreadyCompressed(media: MediaSample, preset: CompressionPreset): boolean {
  if (media.kind === "png") {
    return media.palette || (media.colors !== null && media.colors <= pngColorBudget(preset));
  }
  return (
    media.quality !== null &&
    media.quality <= PRESET_QUALITY[preset] * 100 + JPEG_QUALITY_MARGIN
  );
}

/**
 * Estimate the compressed file size, or null when too little of the deck can
 * shrink for a number to mean anything (the UI says "about the original
 * size"). Fresh JPEG and PNG bytes each shrink by their own preset ratio;
 * already compressed images and everything else are unchanged. The part of
 * the deck that is not already compressed is clamped by the static upper
 * bound.
 *
 * Splitting JPEG vs PNG matters: a PNG-dominated deck barely changes between
 * presets in reality, so a single blended ratio would over-promise on "high"
 * and the estimate would visibly miss.
 */
export function estimatePptxSize(
  totalSize: number,
  media: readonly MediaSample[],
  preset: CompressionPreset,
): number | null {
  let jpegBytes = 0;
  let pngBytes = 0;
  let keptBytes = 0;
  for (const m of media) {
    if (looksAlreadyCompressed(m, preset)) keptBytes += m.bytes;
    else if (m.kind === "jpeg") jpegBytes += m.bytes;
    else pngBytes += m.bytes;
  }
  if (totalSize <= 0 || (jpegBytes + pngBytes) / totalSize < PRESET_IMAGE_SHARE_CUTOFF[preset]) {
    return null;
  }
  const rest = totalSize - keptBytes;
  const untouched = rest - jpegBytes - pngBytes;
  const formula =
    untouched + jpegBytes * PRESET_JPEG_RATIO[preset] + pngBytes * PRESET_PNG_RATIO[preset];
  return keptBytes + Math.min(formula, rest * PRESET_RANGE[preset][1]);
}
