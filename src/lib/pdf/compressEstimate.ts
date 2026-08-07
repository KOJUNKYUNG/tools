import type { CompressionPreset } from "./compressPdf";

/** Reduction factor ranges [min, max] for each preset (fraction of original kept). */
const PRESET_RANGE: Record<CompressionPreset, [number, number]> = {
  low: [0.7, 0.9],
  medium: [0.4, 0.7],
  high: [0.2, 0.4],
};

/** Fraction of original image bytes left after re-encoding at this preset. */
const PRESET_IMAGE_RATIO: Record<CompressionPreset, number> = {
  low: 1.0,
  medium: 0.5,
  high: 0.35,
};

/** Minimum imageShare before the derived model estimate is shown for a preset. */
const PRESET_IMAGE_SHARE_CUTOFF: Record<CompressionPreset, number> = {
  low: Number.POSITIVE_INFINITY,
  medium: 0.05,
  high: 0.02,
};

export function estimateCompressedSize(
  originalSize: number,
  imageShare: number,
  preset: CompressionPreset,
): number {
  const presetRatio = PRESET_IMAGE_RATIO[preset];
  const formula = originalSize * (1 - imageShare * (1 - presetRatio));
  const staticUpper = originalSize * PRESET_RANGE[preset][1];
  return Math.min(formula, staticUpper);
}

export type SizeEstimate =
  | { kind: "actual"; size: number }
  | { kind: "model"; size: number }
  | { kind: "noChange" }
  | { kind: "range"; from: number; to: number };

export interface SelectSizeEstimateInput {
  originalSize: number;
  /** Real compressed size from a completed whole-doc live compress; null if none. */
  actualCompressedSize: number | null;
  /** Fraction of bytes that are images (0..1); null = analysis pending/failed. */
  imageShare: number | null;
  preset: CompressionPreset;
}

/**
 * Decide what size figure to display, in priority order:
 *  1. The real compressed size (faithful preview already ran the whole doc).
 *  2. The model estimate, when image share is known and above the preset cutoff.
 *  3. "no change", when image share is known but below the cutoff.
 *  4. The static range, when image share is unknown.
 */
export function selectSizeEstimate({
  originalSize,
  actualCompressedSize,
  imageShare,
  preset,
}: SelectSizeEstimateInput): SizeEstimate {
  if (actualCompressedSize != null) {
    return { kind: "actual", size: actualCompressedSize };
  }
  if (imageShare != null) {
    if (imageShare >= PRESET_IMAGE_SHARE_CUTOFF[preset]) {
      return { kind: "model", size: Math.round(estimateCompressedSize(originalSize, imageShare, preset)) };
    }
    return { kind: "noChange" };
  }
  const [lo, hi] = PRESET_RANGE[preset];
  return { kind: "range", from: Math.round(originalSize * lo), to: Math.round(originalSize * hi) };
}
