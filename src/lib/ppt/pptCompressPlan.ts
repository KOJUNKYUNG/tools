export type CompressionPreset = "low" | "medium" | "high";

/** JPEG quality (0..1) per preset for media re-encoding. */
export const PRESET_JPEG_QUALITY: Record<CompressionPreset, number> = {
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
  const quality = PRESET_JPEG_QUALITY[preset];
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

/** Fraction of recompressible bytes left after re-encoding at each preset. */
export const PRESET_IMAGE_RATIO: Record<CompressionPreset, number> = {
  low: 0.85,
  medium: 0.6,
  high: 0.45,
};

/** Whole-file [min,max] remaining range used as a static fallback estimate. */
export const PRESET_RANGE: Record<CompressionPreset, [number, number]> = {
  low: [0.85, 0.98],
  medium: [0.6, 0.9],
  high: [0.45, 0.75],
};

/**
 * Minimum recompressible-share before the derived estimate is shown.
 * Below the cutoff we display "~ original size" instead of a misleading number.
 */
export const PRESET_IMAGE_SHARE_CUTOFF: Record<CompressionPreset, number> = {
  low: 0.15,
  medium: 0.05,
  high: 0.03,
};

/**
 * Estimate the compressed file size: the recompressible portion shrinks to
 * PRESET_IMAGE_RATIO, the rest is unchanged. Clamped by the static upper bound.
 */
export function estimatePptxSize(
  totalSize: number,
  recompressibleBytes: number,
  preset: CompressionPreset,
): number {
  const ratio = PRESET_IMAGE_RATIO[preset];
  const formula = totalSize - recompressibleBytes + recompressibleBytes * ratio;
  const staticUpper = totalSize * PRESET_RANGE[preset][1];
  return Math.min(formula, staticUpper);
}
