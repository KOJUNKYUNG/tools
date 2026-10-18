import JSZip from "jszip";
import imageCompression from "browser-image-compression";
import type { CompressionPreset } from "@/lib/common/compressionPreset";
import {
  countColors,
  estimateJpegQuality,
  readPngHeader,
  type ColorCount,
} from "@/lib/image/alreadyCompressed";
import { runOutputCheck } from "@/lib/output-check/core";
import { notSmaller } from "@/lib/output-check/sizeBound";
import { getExt, getMime } from "./pptImageFormats";
import { aggregateFormats } from "./analyzePresentation";
import {
  classifyMedia,
  pickSmaller,
  pngColorBudget,
  RECOMPRESSIBLE_EXTS,
  type MediaAction,
  type MediaSample,
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

/** Re-encodes one image in its own format; the browser canvas at run time. */
export type RecompressMedia = (
  bytes: Uint8Array,
  action: Extract<MediaAction, { kind: "jpeg" | "png" }>,
) => Promise<Uint8Array>;

/**
 * Counts a PNG's distinct colours up to one past `cap`; null when it cannot.
 * The browser canvas at run time.
 */
export type CountPngColors = (bytes: Uint8Array, cap: number) => Promise<ColorCount | null>;

/** Past the weakest preset's budget, every preset would quantize the PNG. */
const COLOR_COUNT_CAP = Math.ceil(pngColorBudget("low"));

/**
 * Larger PNGs are not decoded for the count (16 MP, 64 MB of RGBA) and are
 * estimated as fresh, as before #78.
 */
const MAX_COUNT_PIXELS = 16 * 1024 * 1024;

/**
 * Decodes through a canvas with the browser's default colour handling, as the
 * engine's re-encoder does, so the count is of the pixels it would quantize.
 * Without OffscreenCanvas (or on a decode failure) the PNG is not counted and
 * the estimate treats it as fresh.
 */
const countPngColorsInBrowser: CountPngColors = async (bytes, cap) => {
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
      return countColors(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, cap);
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
  countPngColors: CountPngColors = countPngColorsInBrowser,
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
          ? await countPngColors(bytes, COLOR_COUNT_CAP)
          : null;
      const hasAlpha = header?.colorType === 4 || header?.colorType === 6;
      media.push({
        kind: "png",
        bytes: bytes.length,
        palette,
        colors: counted?.colors ?? null,
        unusedAlpha: hasAlpha && (counted?.opaque ?? false),
      });
    } else {
      media.push({ kind: "jpeg", bytes: bytes.length, quality: estimateJpegQuality(bytes) });
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

async function recompressMedia(
  bytes: Uint8Array,
  action: Extract<MediaAction, { kind: "jpeg" | "png" }>,
): Promise<Uint8Array> {
  const mime = action.kind === "jpeg" ? "image/jpeg" : "image/png";
  // new Uint8Array(...) keeps BlobPart happy under TS strict.
  const inputFile = new File([new Uint8Array(bytes)], "m", { type: mime });
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
        let candidate: Uint8Array | null = null;
        try {
          candidate = await recompress(original, action);
        } catch {
          // Re-encode failure (corrupt/odd image) -> keep the original bytes.
          candidate = null;
        }
        // A candidate in the wrong format or shape would distort its fixed
        // slide frame: keep the original bytes instead (spec #51, #65).
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
