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
 * Fraction of JPEG bytes left after re-encoding at each preset, for a JPEG
 * whose save quality cannot be read. Otherwise `JPEG_RATIO_BY_QUALITY`
 * decides.
 */
const PRESET_JPEG_RATIO: Record<CompressionPreset, number> = {
  low: 0.78,
  medium: 0.58,
  high: 0.42,
};

/**
 * Fraction of a JPEG's bytes left after re-encoding at each preset, by the
 * quality it was saved at, whether a fresh JPEG or the engine's own output:
 * [quality, ratio] points, joined by straight lines and held flat past the
 * last. Measured with scripts/measure-ppt-ratios (browser-image-compression
 * 2.0.2, Chrome, 2026-10-19) on the 24 Kodak photos saved by Chrome at each
 * quality (byte-weighted, n=24 per point; each point's images spread within
 * ±0.08 at low, ±0.06 at medium, ±0.07 at high). The curve steps where one
 * quantization table divides into the other: iPhone photos (HEIC hold-out,
 * n=6) step the same way and land within 0.04 at q76/86/88/95. Odd
 * qualities, measured too, sit between their neighbours: the straight line
 * misses them by at most 0.033 (medium q85).
 *
 * At the presets' qualities, q70 and q82, the points are the re-run ratios
 * measured on the engine's own output (#81: real-file images, n=21, which
 * shrank like Kodak's within 0.02); that leaves high flat from q82 to q84.
 * Below the first point each curve rises to 1 where a JPEG already counts as
 * compressed (see `jpegRatioAt`). Every point was measured at the current
 * `PRESET_QUALITY`; change a preset's quality and re-measure the whole curve.
 */
const JPEG_RATIO_BY_QUALITY: Record<CompressionPreset, readonly (readonly [number, number])[]> = {
  low: [[86, 0.942], [88, 0.885], [90, 0.836], [92, 0.626], [94, 0.549], [96, 0.443], [98, 0.354]],
  medium: [
    [74, 0.97], [76, 0.96], [78, 0.919], [80, 0.888], [82, 0.86], [84, 0.823], [86, 0.609],
    [88, 0.55], [90, 0.525], [92, 0.501], [94, 0.404], [96, 0.331], [98, 0.26],
  ],
  high: [
    [70, 0.89], [74, 0.85], [76, 0.835], [78, 0.645], [80, 0.546], [82, 0.51], [84, 0.514],
    [86, 0.501], [88, 0.471], [90, 0.394], [92, 0.373], [94, 0.312], [96, 0.253], [98, 0.2],
  ],
};

/**
 * What a 4:4:4 JPEG leaves against the curve, which was measured on 4:2:0
 * sources: the engine writes 4:2:0, so it also drops three quarters of the
 * chroma. Byte-weighted over the real-file 4:4:4 JPEGs, all saved at q95
 * (n=11: ten photos from one deck and one download; per image 0.53–0.95 at
 * low, 0.40–0.96 at medium, 0.32–0.98 at high), so it applies from q90 up
 * only. Below that a 4:4:4 JPEG gets the curve alone, which can only
 * under-promise. The measurement page lists these JPEGs with their ratios.
 */
const FULL_CHROMA_FACTOR: Record<CompressionPreset, number> = {
  low: 0.81,
  medium: 0.77,
  high: 0.74,
};
const FULL_CHROMA_MIN_QUALITY = 90;

/**
 * The curve's ratio at `quality`: 1 up to where a JPEG already counts as
 * compressed at `preset`, then linear between points, flat past the last.
 */
function jpegRatioAt(quality: number, preset: CompressionPreset): number {
  const curve: readonly (readonly [number, number])[] = [
    [PRESET_QUALITY[preset] * 100 + JPEG_QUALITY_MARGIN, 1],
    ...JPEG_RATIO_BY_QUALITY[preset],
  ];
  const next = curve.findIndex(([q]) => q >= quality);
  if (next === -1) return curve[curve.length - 1][1];
  if (next === 0) return curve[0][1];
  const [q0, r0] = curve[next - 1];
  const [q1, r1] = curve[next];
  return r0 + ((r1 - r0) * (quality - q0)) / (q1 - q0);
}

/**
 * How much of a fresh PNG is left after re-encoding at each preset. The
 * re-encode quantizes to the preset's colour budget, so what comes out is set
 * by what the image shows, not by how it was saved: the same photo saved two
 * ways comes out the same size. So a PNG is expected to leave the smaller of
 *
 * - `PNG_BYTES_PER_VISIBLE_PIXEL` per pixel that is not fully transparent:
 *   a photo or a cut-out, which a transparent background makes cheap, and
 * - `FLAT_PNG_RATIO` of its bytes: a flat graphic, already small, that
 *   barely shrinks.
 *
 * Fit with scripts/measure-ppt-ratios (browser-image-compression 2.0.2,
 * Chrome, 2026-10-19) on the real-file PNGs the estimate treats as fresh,
 * byte-weighted, each kept when its candidate is no smaller as the engine
 * does: bytes per visible pixel over the 24 above 1.2 bytes per pixel (per
 * image 1.0–1.9 at medium), the ratio over the 57 below (per image
 * 0.23–1.00). In-sample on those decks (PNGs per deck −14% to +7% at medium).
 * Hold-out: the 24 Kodak photos as opaque PNGs come out −4% as found and
 * +10% saved by Chrome, per image −15% to +51%.
 */
const PNG_BYTES_PER_VISIBLE_PIXEL: Record<CompressionPreset, number> = {
  low: 1.55,
  medium: 1.498,
  high: 1.419,
};
const FLAT_PNG_RATIO: Record<CompressionPreset, number> = {
  low: 0.841,
  medium: 0.824,
  high: 0.791,
};

/** A fresh PNG's remaining ratio; without a pixel count, the flat ratio, the smaller promise. */
function freshPngRatio(
  media: Extract<MediaSample, { kind: "png" }>,
  preset: CompressionPreset,
): number {
  const flat = FLAT_PNG_RATIO[preset];
  if (media.visiblePixels === null || media.bytes <= 0) return flat;
  return Math.min(flat, (media.visiblePixels * PNG_BYTES_PER_VISIBLE_PIXEL[preset]) / media.bytes);
}

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
      /** Colour stored without chroma subsampling (4:4:4). */
      fullChroma: boolean;
    }
  | {
      kind: "png";
      bytes: number;
      /**
       * Pixels not fully transparent; every pixel when it was not decoded;
       * null if its header is unreadable.
       */
      visiblePixels: number | null;
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
 * compression asks UPNG for 4096 × quality colours, and UPNG splits colour
 * groups while it has fewer than that, so it keeps up to the next whole
 * number (low 3359). An opaque photo's output fills it exactly (#87).
 */
export function pngColorBudget(preset: CompressionPreset): number {
  return Math.ceil(4096 * PRESET_QUALITY[preset]);
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
 * re-encode is no smaller (#78). Compared against the chosen preset only: a
 * JPEG saved at a weaker preset follows `JPEG_RATIO_BY_QUALITY`, and a PNG
 * within a weaker preset's budget is `savedAtWeakerPreset`.
 */
export function looksAlreadyCompressed(media: MediaSample, preset: CompressionPreset): boolean {
  if (media.kind === "png") return media.palette || pngWithinBudget(media, preset);
  return (
    media.quality !== null &&
    media.quality <= PRESET_QUALITY[preset] * 100 + JPEG_QUALITY_MARGIN
  );
}

/**
 * A truecolour PNG already within `preset`'s colour budget. Within the budget,
 * the engine still shrinks a PNG it can write indexed or whose unused alpha
 * channel it can drop.
 */
function pngWithinBudget(
  media: Extract<MediaSample, { kind: "png" }>,
  preset: CompressionPreset,
): boolean {
  return (
    media.colors !== null &&
    media.colors > INDEXED_MAX_COLORS &&
    media.colors <= pngColorBudget(preset) &&
    !media.unusedAlpha
  );
}

/** The presets weaker than each one, strongest first. */
const WEAKER_PRESETS: Record<CompressionPreset, readonly CompressionPreset[]> = {
  low: [],
  medium: ["low"],
  high: ["medium", "low"],
};

/**
 * Fraction of a PNG's bytes left when a PNG saved at a weaker preset (the
 * inner key) is re-run at a stronger one (the outer key). Re-quantizing a PNG
 * already within a nearby colour budget saves far less than the fresh ratio
 * (#81). Byte-weighted means over the real-file PNGs (n=72), measured with
 * scripts/measure-ppt-ratios (browser-image-compression 2.0.2, Chrome,
 * 2026-10-19); re-run it when the fixtures change:
 *
 *   low → medium    0.97 (0.95–1.00)
 *   low → high      0.92 (0.89–1.00)
 *   medium → high   0.95 (0.93–1.00)
 *
 * A JPEG needs no such table: `JPEG_RATIO_BY_QUALITY` covers the engine's own
 * output at each preset's quality.
 */
const PNG_RERUN_RATIO: Record<CompressionPreset, Partial<Record<CompressionPreset, number>>> = {
  low: {},
  medium: { low: 0.97 },
  high: { low: 0.92, medium: 0.95 },
};

/**
 * The strongest weaker preset (the tightest budget) whose colour budget
 * `media` already fits, or null. Only meaningful for a PNG that does not
 * already look compressed at `preset`, so it is over `preset`'s budget and
 * not indexed.
 */
function savedAtWeakerPreset(
  media: Extract<MediaSample, { kind: "png" }>,
  preset: CompressionPreset,
): CompressionPreset | null {
  return WEAKER_PRESETS[preset].find((weaker) => pngWithinBudget(media, weaker)) ?? null;
}

/** Fraction of `media`'s bytes expected to be left after compressing at `preset`. */
function remainingRatio(media: MediaSample, preset: CompressionPreset): number {
  if (looksAlreadyCompressed(media, preset)) return 1;
  if (media.kind === "jpeg") {
    if (media.quality === null) return PRESET_JPEG_RATIO[preset];
    const ratio = jpegRatioAt(media.quality, preset);
    return media.fullChroma && media.quality >= FULL_CHROMA_MIN_QUALITY
      ? ratio * FULL_CHROMA_FACTOR[preset]
      : ratio;
  }
  const weaker = savedAtWeakerPreset(media, preset);
  return (weaker && PNG_RERUN_RATIO[preset][weaker]) ?? freshPngRatio(media, preset);
}

/**
 * Estimate the compressed file size, or null when too little of the deck can
 * shrink for a number to mean anything (the UI says "about the original
 * size"). JPEG bytes shrink by what their save quality leaves at the preset
 * (one curve for fresh JPEGs and the engine's own output alike), PNG bytes
 * by what their visible pixels or the flat-graphic ratio leave, or by the
 * re-run ratio when saved at a weaker preset; already compressed images and everything else are unchanged. The
 * result is not pulled into the static range: on a deck that is mostly not
 * images, that would promise savings the images cannot deliver (#81).
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
