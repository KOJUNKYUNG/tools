import JSZip from "jszip";
import imageCompression from "browser-image-compression";
import type { CompressionPreset } from "@/lib/common/compressionPreset";
import {
  countColors,
  countVisiblePixels,
  estimateJpegQuality,
  jpegKeepsFullChroma,
  readPngHeader,
  type ColorCount,
} from "@/lib/image/alreadyCompressed";
import { downscaleImage } from "@/lib/image/downscale";
import { runOutputCheck } from "@/lib/output-check/core";
import { displayedSize, readImageHeader } from "@/lib/output-check/imageHeader";
import { notSmaller } from "@/lib/output-check/sizeBound";
import { getExt, getMime } from "./pptImageFormats";
import { aggregateFormats } from "./analyzePresentation";
import { readDisplaySizes, type DisplaySize } from "./displaySize";
import {
  classifyMedia,
  downsampleTarget,
  pickSmaller,
  PRESET_SLIDE_WIDTH_PX,
  pngColorBudget,
  RECOMPRESSIBLE_EXTS,
  type MediaAction,
  type MediaSample,
  type PixelSize,
} from "./pptCompressPlan";
import { checkPptCompress, recompressedMediaViolations } from "./pptCompressCheck";

const MEDIA_PREFIX = "ppt/media/";
const SLIDE_RE = /^ppt\/slides\/slide\d+\.xml$/;

// Image extensions counted as "images" in the preview breakdown.
const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "tiff",
  "tif",
  "svg",
]);

export interface PptxCompressAnalysis {
  totalSize: number;
  /** Number of slides (ppt/slides/slideN.xml entries). */
  slideCount: number;
  /** Each jpg/jpeg/png in ppt/media, for the size estimate. */
  media: MediaSample[];
  imageCount: number;
  formatCounts: Record<string, number>;
  /**
   * The single largest recompressible image, decoded for the preview. PPTX
   * slides can't be rendered in the browser, and the embedded docProps
   * thumbnail is a ~2KB low-res image that reads as a blank box — the biggest
   * real image (the score/photo that dominates the deck) is far more useful.
   */
  previewBlob: Blob | null;
  previewMime: string | null;
}

export interface CompressPptxOptions {
  file: File;
  preset: CompressionPreset;
  onProgress?: (pct: number) => void;
}

/**
 * What a compression run hands back. "not-smaller" is not an error: the
 * output came out no smaller than the input, so there is nothing to offer and
 * the original is not passed off as compressed (spec #51, decided in #60).
 */
export type CompressPptxResult =
  | { kind: "compressed"; data: Uint8Array; originalSize: number; compressedSize: number }
  | {
      kind: "not-smaller";
      originalSize: number;
      compressedSize: number;
      /**
       * False when no image could be re-encoded at all (none to re-encode, or
       * every attempt threw or broke the image's format or displayed size): a
       * stronger preset would change nothing, so the tool must not suggest
       * one. A valid re-encode that came out larger still counts: a stronger
       * preset may shrink it.
       */
      anyImageReencoded: boolean;
    };

/**
 * Re-encodes one image in its own format, first shrunk to the action's
 * `target` (upright, as displayed) when it has one; the browser canvas at
 * run time.
 */
export type RecompressMedia = (
  bytes: Uint8Array,
  action: Extract<MediaAction, { kind: "jpeg" | "png" }>,
) => Promise<Uint8Array>;

/** A PNG's colour count, and how many of its pixels are not fully transparent. */
export interface PngPixelCount extends ColorCount {
  visible: number;
}

/**
 * Counts a PNG's distinct colours up to one past `cap`, and its visible
 * pixels; null when it cannot. The browser canvas at run time.
 */
export type CountPngPixels = (bytes: Uint8Array, cap: number) => Promise<PngPixelCount | null>;

/** Past the weakest preset's budget, every preset would quantize the PNG. */
const COLOR_COUNT_CAP = pngColorBudget("low");

/**
 * Larger PNGs are not decoded for the count (16 MP, 64 MB of RGBA): they are
 * estimated as fresh, as before #78, with every pixel taken as visible.
 */
const MAX_COUNT_PIXELS = 16 * 1024 * 1024;

/**
 * Decodes through a canvas with the browser's default colour handling, as the
 * engine's re-encoder does, so the count is of the pixels it would quantize.
 * Without OffscreenCanvas (or on a decode failure) the PNG is not counted and
 * the estimate treats it as fresh, with every pixel taken as visible.
 */
const countPngPixelsInBrowser: CountPngPixels = async (bytes, cap) => {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
    return null;
  }
  try {
    // new Uint8Array(...) keeps BlobPart happy under TS strict.
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
    try {
      const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0);
      const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      return { ...countColors(pixels, cap), visible: countVisiblePixels(pixels) };
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
};

/**
 * Idle-time analysis: pull the embedded thumbnail, count images, and read
 * each recompressible image's size and signs of earlier compression for the
 * size estimate. One unzip per file.
 */
export async function analyzePptxForCompress(
  file: File,
  countPngPixels: CountPngPixels = countPngPixelsInBrowser,
): Promise<PptxCompressAnalysis> {
  const ab = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);

  const imageBaseNames: string[] = [];
  const recompressiblePaths: string[] = [];
  let slideCount = 0;

  zip.forEach((path, entry) => {
    if (entry.dir) return;
    if (SLIDE_RE.test(path)) slideCount++;
    if (!path.startsWith(MEDIA_PREFIX)) return;
    const base = path.split("/").pop();
    if (!base) return;
    const ext = getExt(base);
    if (IMAGE_EXTS.has(ext)) imageBaseNames.push(base);
    if (RECOMPRESSIBLE_EXTS.has(ext)) recompressiblePaths.push(path);
  });

  const { imageCount, formatCounts } = aggregateFormats(imageBaseNames);

  const media: MediaSample[] = [];
  // Track the largest recompressible image to use as the preview.
  let largestBytes: Uint8Array | null = null;
  let largestExt = "";
  for (const p of recompressiblePaths) {
    const entry = zip.file(p);
    if (!entry) continue;
    const bytes = await entry.async("uint8array");
    const ext = getExt(p);
    if (ext === "png") {
      const header = readPngHeader(bytes);
      const palette = header?.colorType === 3;
      // A palette PNG already counts as compressed; no need to decode it.
      const counted =
        header && !palette && header.width * header.height <= MAX_COUNT_PIXELS
          ? await countPngPixels(bytes, COLOR_COUNT_CAP)
          : null;
      const hasAlpha = header?.colorType === 4 || header?.colorType === 6;
      media.push({
        kind: "png",
        bytes: bytes.length,
        visiblePixels: counted?.visible ?? (header ? header.width * header.height : null),
        palette,
        colors: counted?.colors ?? null,
        unusedAlpha: hasAlpha && (counted?.opaque ?? false),
      });
    } else {
      media.push({
        kind: "jpeg",
        bytes: bytes.length,
        quality: estimateJpegQuality(bytes),
        fullChroma: jpegKeepsFullChroma(bytes),
      });
    }
    if (!largestBytes || bytes.length > largestBytes.length) {
      largestBytes = bytes;
      largestExt = ext;
    }
  }

  let previewBlob: Blob | null = null;
  let previewMime: string | null = null;
  if (largestBytes) {
    previewMime = getMime(largestExt);
    // new Uint8Array(...) required for TS strict (BlobPart needs ArrayBuffer).
    previewBlob = new Blob([new Uint8Array(largestBytes)], { type: previewMime });
  }

  return {
    totalSize: file.size,
    slideCount,
    media,
    imageCount,
    formatCounts,
    previewBlob,
    previewMime,
  };
}

/**
 * The picture shrunk to `target` with the shared resizer, as a lossless PNG
 * for the encoder; null when the browser cannot resize it, which leaves the
 * same-size re-encode.
 */
async function resizedForEncoder(original: Blob, target: PixelSize): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
    return null;
  }
  try {
    const canvas = await downscaleImage(original, target.width, target.height);
    try {
      return await canvas.convertToBlob({ type: "image/png" });
    } finally {
      canvas.width = canvas.height = 0;
    }
  } catch {
    return null;
  }
}

async function recompressMedia(
  bytes: Uint8Array,
  action: Extract<MediaAction, { kind: "jpeg" | "png" }>,
): Promise<Uint8Array> {
  const mime = action.kind === "jpeg" ? "image/jpeg" : "image/png";
  // new Uint8Array(...) keeps BlobPart happy under TS strict.
  const original = new Blob([new Uint8Array(bytes)], { type: mime });
  const resized = action.target ? await resizedForEncoder(original, action.target) : null;
  // The encoder reads the format to write from `fileType`, not the input's.
  const inputFile = new File([resized ?? original], "m", { type: resized?.type ?? mime });
  const out = await imageCompression(inputFile, {
    maxSizeMB: Number.POSITIVE_INFINITY,
    initialQuality: action.quality, // for PNG: quantize to 4096 × quality colours
    useWebWorker: true,
    fileType: mime,
  });
  const buf = await out.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Unpack -> re-encode each jpg/jpeg/png in ppt/media/* in place (same format,
 * same path) -> repackage. Entries are never added, removed, or renamed, so the
 * slide rels and [Content_Types].xml stay valid.
 */
export async function compressPptx({
  file,
  preset,
  onProgress,
}: CompressPptxOptions): Promise<CompressPptxResult> {
  onProgress?.(5);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return compressPptxFromBytes({ bytes, preset, onProgress });
}

export interface CompressPptxFromBytesOptions {
  bytes: Uint8Array;
  preset: CompressionPreset;
  onProgress?: (pct: number) => void;
  /** The image re-encoder; tests and Node stand one in for the canvas. */
  recompress?: RecompressMedia;
}

/**
 * The engine entry, runnable in Node with `recompress` stood in. Each
 * re-encoded image is kept only when it is smaller and passes the image
 * properties (format, displayed size); otherwise that image keeps its
 * original bytes. The repackaged deck then goes through the output check
 * (see pptCompressCheck.ts): damage blocks, and a deck no smaller than the
 * input comes back as "not-smaller".
 */
export async function compressPptxFromBytes({
  bytes,
  preset,
  onProgress,
  recompress = recompressMedia,
}: CompressPptxFromBytesOptions): Promise<CompressPptxResult> {
  const zip = await JSZip.loadAsync(bytes);

  const mediaPaths: string[] = [];
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    if (path.startsWith(MEDIA_PREFIX) && RECOMPRESSIBLE_EXTS.has(getExt(path))) {
      mediaPaths.push(path);
    }
  });

  // Read only when the preset downsamples: the slides' XML is not needed otherwise.
  const displaySizes =
    PRESET_SLIDE_WIDTH_PX[preset] === null
      ? new Map<string, DisplaySize | null>()
      : await readDisplaySizes(bytes);

  onProgress?.(15);
  let anyImageReencoded = false;
  const total = mediaPaths.length;
  for (let i = 0; i < total; i++) {
    const path = mediaPaths[i];
    const entry = zip.file(path);
    if (entry) {
      const original = await entry.async("uint8array");
      const action = classifyMedia(getExt(path), preset);
      if (action.kind !== "passthrough") {
        const header = readImageHeader(original);
        const shown = header && displayedSize(header);
        const target = shown
          ? downsampleTarget({ width: shown[0], height: shown[1] }, displaySizes.get(path) ?? null, preset)
          : null;
        let candidate: Uint8Array | null = null;
        try {
          candidate = await recompress(original, target ? { ...action, target } : action);
        } catch {
          // Re-encode failure (corrupt/odd image) -> keep the original bytes.
          candidate = null;
        }
        // A candidate in the wrong format or shape would distort its fixed
        // slide frame: keep the original bytes instead (spec #51, #65). A
        // resized one that passes counts as re-encoded like any other.
        if (candidate && recompressedMediaViolations(path, original, candidate).length > 0) {
          candidate = null;
        }
        if (candidate) anyImageReencoded = true;
        const chosen = pickSmaller(original, candidate);
        if (chosen.usedCandidate) {
          // Replace bytes at the SAME path; STORE because jpeg/png don't
          // benefit from DEFLATE and re-deflating wastes CPU.
          zip.file(path, chosen.bytes, { compression: "STORE" });
        }
      }
    }
    onProgress?.(15 + Math.round(((i + 1) / Math.max(total, 1)) * 70));
  }

  onProgress?.(88);
  const generated = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const sizes = { originalSize: bytes.byteLength, compressedSize: generated.byteLength };
  // Not shrinking is checked first: no file is offered then, damaged or not.
  // Unlike pdf-compress, no safer re-run exists that could still shrink it
  // (bad images were already swapped back above), so the damage check is
  // skipped and the tool says "could not shrink" rather than "damaged".
  if (notSmaller(bytes, generated)) {
    onProgress?.(100);
    return { kind: "not-smaller", ...sizes, anyImageReencoded };
  }
  // The output is smaller, so the size bound holds and only damage remains.
  const data = await runOutputCheck({
    tool: "ppt-compress",
    output: generated,
    check: (out) => checkPptCompress(bytes, { preset }, out, "quick"),
  });
  onProgress?.(100);
  return { kind: "compressed", data, ...sizes };
}
