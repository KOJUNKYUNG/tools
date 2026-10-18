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
      /** Stores an alpha channel that every pixel leaves fully opaque. */
      unusedAlpha: boolean;
    };

/** The engine writes a PNG of this many colours or fewer as an indexed PNG. */
const INDEXED_MAX_COLORS = 256;

/**
 * The colour budget a preset's PNG re-encode quantizes to: browser-image-
 * compression keeps at most 4096 × quality colours.
 */
export function pngColorBudget(preset: CompressionPreset): number {
  return 4096 * PRESET_QUALITY[preset];
}

/**
 * A JPEG this many quality points above the preset's still counts as already
 * compressed. Chrome's canvas writes the exact IJG tables, so its output reads
 * back exactly; the margin covers encoders whose tables differ slightly.
 */
const JPEG_QUALITY_MARGIN = 2;

/**
 * Whether re-encoding at `preset` is unlikely to shrink the image: a JPEG
 * already saved at about the preset's quality or lower, or a PNG already
 * indexed, or already within the preset's colour budget (the engine's own
 * output has at most that many colours but stays truecolour). Such an image
 * is expected to keep its size, since the engine keeps the original when the
 * re-encode is no smaller (#78). Compared against the chosen preset only; an
 * image saved at a weaker preset is `savedAtWeakerPreset`.
 */
export function looksAlreadyCompressed(media: MediaSample, preset: CompressionPreset): boolean {
  if (media.kind === "png") {
    if (media.palette) return true;
    // Within the budget, the engine still shrinks a PNG it can write indexed
    // or whose unused alpha channel it can drop.
    return (
      media.colors !== null &&
      media.colors > INDEXED_MAX_COLORS &&
      media.colors <= pngColorBudget(preset) &&
      !media.unusedAlpha
    );
  }
  return (
    media.quality !== null &&
    media.quality <= PRESET_QUALITY[preset] * 100 + JPEG_QUALITY_MARGIN
  );
}

/** The presets weaker than each one, strongest first. */
const WEAKER_PRESETS: Record<CompressionPreset, readonly CompressionPreset[]> = {
  low: [],
  medium: ["low"],
  high: ["medium", "low"],
};

/**
 * Fraction of bytes left when an image saved at a weaker preset (the inner
 * key) is re-run at a stronger one (the outer key). Re-encoding an image
 * already quantized at a nearby quality saves far less than the fresh ratio
 * (#81). Measured with scripts/measure-ppt-ratios (browser-image-compression
 * 2.0.2, Chrome, 2026-10-19) as byte-weighted means over the real-file
 * images: 21 JPEGs, 72 PNGs. JPEG low → high spreads widely (0.25–0.87); the
 * others stay within about ±0.06. Fresh JPEGs saved at q80–84 shrank like
 * the engine's own low output (0.855 vs 0.864 at medium, n=4), so a JPEG
 * near a preset's quality counts as that preset's output whatever made it.
 */
export const RERUN_RATIO: Record<
  MediaSample["kind"],
  Record<CompressionPreset, Partial<Record<CompressionPreset, number>>>
> = {
  jpeg: { low: {}, medium: { low: 0.86 }, high: { low: 0.51, medium: 0.89 } },
  png: { low: {}, medium: { low: 0.97 }, high: { low: 0.92, medium: 0.95 } },
};

/**
 * The weaker preset whose output `media` looks like, or null: a JPEG saved
 * within the margin of that preset's quality, or a PNG of more colours than
 * `preset`'s budget but within the weaker one's (and none the engine could
 * still write indexed or without its alpha). Only meaningful for an image
 * that does not already look compressed at `preset`.
 */
export function savedAtWeakerPreset(
  media: MediaSample,
  preset: CompressionPreset,
): CompressionPreset | null {
  for (const weaker of WEAKER_PRESETS[preset]) {
    if (media.kind === "jpeg") {
      const quality = PRESET_QUALITY[weaker] * 100;
      if (media.quality !== null && Math.abs(media.quality - quality) <= JPEG_QUALITY_MARGIN) {
        return weaker;
      }
    } else if (
      !media.palette &&
      media.colors !== null &&
      media.colors > INDEXED_MAX_COLORS &&
      media.colors <= pngColorBudget(weaker) &&
      !media.unusedAlpha
    ) {
      return weaker;
    }
  }
  return null;
}

/** Fraction of `media`'s bytes expected to be left after compressing at `preset`. */
function remainingRatio(media: MediaSample, preset: CompressionPreset): number {
  if (looksAlreadyCompressed(media, preset)) return 1;
  const weaker = savedAtWeakerPreset(media, preset);
  const rerun = weaker && RERUN_RATIO[media.kind][preset][weaker];
  if (rerun) return rerun;
  return media.kind === "jpeg" ? PRESET_JPEG_RATIO[preset] : PRESET_PNG_RATIO[preset];
}

/**
 * Estimate the compressed file size, or null when too little of the deck can
 * shrink for a number to mean anything (the UI says "about the original
 * size"). Fresh JPEG and PNG bytes each shrink by their own preset ratio,
 * images saved at a weaker preset by their re-run ratio; already compressed
 * images and everything else are unchanged. The result is
 * not pulled into the static range: on a deck that is mostly not images, that
 * would promise savings the images cannot deliver (#81).
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
  let shrinkingBytes = 0;
  let savedBytes = 0;
  for (const m of media) {
    const ratio = remainingRatio(m, preset);
    if (ratio >= 1) continue;
    shrinkingBytes += m.bytes;
    savedBytes += m.bytes * (1 - ratio);
  }
  if (totalSize <= 0 || shrinkingBytes / totalSize < PRESET_IMAGE_SHARE_CUTOFF[preset]) {
    return null;
  }
  return totalSize - savedBytes;
}
