import JSZip from "jszip";
import imageCompression from "browser-image-compression";
import { runOutputCheck } from "@/lib/output-check/core";
import { notSmaller, SIZE_BOUND } from "@/lib/output-check/sizeBound";
import { getExt, getMime } from "./pptImageFormats";
import { aggregateFormats } from "./analyzePresentation";
import {
  classifyMedia,
  pickSmaller,
  RECOMPRESSIBLE_EXTS,
  type CompressionPreset,
  type MediaAction,
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
  /** Sum of jpg/jpeg media bytes (preset-sensitive in the estimate). */
  jpegBytes: number;
  /** Sum of png media bytes (preset-independent in the estimate). */
  pngBytes: number;
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
       * every attempt failed or was kept as the original): a stronger preset
       * would change nothing, so the tool must not suggest one.
       */
      anyImageReencoded: boolean;
    };

/** Re-encodes one image in its own format; the browser canvas at run time. */
export type RecompressMedia = (
  bytes: Uint8Array,
  action: Extract<MediaAction, { kind: "jpeg" | "png" }>,
) => Promise<Uint8Array>;

/**
 * Idle-time analysis: pull the embedded thumbnail, count images, and sum the
 * recompressible media bytes for the size estimate. One unzip per file.
 */
export async function analyzePptxForCompress(
  file: File,
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

  let jpegBytes = 0;
  let pngBytes = 0;
  // Track the largest recompressible image to use as the preview.
  let largestBytes: Uint8Array | null = null;
  let largestExt = "";
  for (const p of recompressiblePaths) {
    const entry = zip.file(p);
    if (!entry) continue;
    const bytes = await entry.async("uint8array");
    const ext = getExt(p);
    if (ext === "png") pngBytes += bytes.length;
    else jpegBytes += bytes.length;
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
    jpegBytes,
    pngBytes,
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
    initialQuality: action.quality, // ignored for PNG (lossless re-encode)
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

  // Damage is checked first: a damaged output blocks whatever its size. Bad
  // images were already swapped back above, so no safer re-run remains.
  // Not shrinking is an outcome, handled after.
  const data = await runOutputCheck({
    tool: "ppt-compress",
    output: generated,
    check: async (out) =>
      (await checkPptCompress(bytes, { preset }, out, "quick")).filter(
        (v) => v.property !== SIZE_BOUND,
      ),
  });
  onProgress?.(100);

  const sizes = { originalSize: bytes.byteLength, compressedSize: data.byteLength };
  return notSmaller(bytes, data)
    ? { kind: "not-smaller", ...sizes, anyImageReencoded }
    : { kind: "compressed", data, ...sizes };
}
