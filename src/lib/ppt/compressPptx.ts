import JSZip from "jszip";
import imageCompression from "browser-image-compression";
import { getExt, getMime } from "./pptImageFormats";
import { aggregateFormats, pickThumbnailPath } from "./analyzePresentation";
import {
  classifyMedia,
  pickSmaller,
  RECOMPRESSIBLE_EXTS,
  type CompressionPreset,
  type MediaAction,
} from "./pptCompressPlan";
import { assertPptxIntegrity } from "./pptCompressIntegrity";

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
  /** Sum of jpg/jpeg/png media byte lengths — drives the derived estimate. */
  recompressibleBytes: number;
  imageCount: number;
  formatCounts: Record<string, number>;
  thumbnailBlob: Blob | null;
  thumbnailMime: string | null;
}

export interface CompressPptxOptions {
  file: File;
  preset: CompressionPreset;
  onProgress?: (pct: number) => void;
}

export interface CompressPptxResult {
  data: Uint8Array;
  originalSize: number;
  compressedSize: number;
  ratio: number;
}

/**
 * Idle-time analysis: pull the embedded thumbnail, count images, and sum the
 * recompressible media bytes for the size estimate. One unzip per file.
 */
export async function analyzePptxForCompress(
  file: File,
): Promise<PptxCompressAnalysis> {
  const ab = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);

  const allPaths: string[] = [];
  const imageBaseNames: string[] = [];
  const recompressiblePaths: string[] = [];

  zip.forEach((path, entry) => {
    if (entry.dir) return;
    allPaths.push(path);
    if (!path.startsWith(MEDIA_PREFIX)) return;
    const base = path.split("/").pop();
    if (!base) return;
    const ext = getExt(base);
    if (IMAGE_EXTS.has(ext)) imageBaseNames.push(base);
    if (RECOMPRESSIBLE_EXTS.has(ext)) recompressiblePaths.push(path);
  });

  const { imageCount, formatCounts } = aggregateFormats(imageBaseNames);

  let recompressibleBytes = 0;
  for (const p of recompressiblePaths) {
    const entry = zip.file(p);
    if (!entry) continue;
    const bytes = await entry.async("uint8array");
    recompressibleBytes += bytes.length;
  }

  const thumbPath = pickThumbnailPath(allPaths);
  let thumbnailBlob: Blob | null = null;
  let thumbnailMime: string | null = null;
  if (thumbPath) {
    const entry = zip.file(thumbPath);
    if (entry) {
      const bytes = await entry.async("uint8array");
      thumbnailMime = getMime(getExt(thumbPath));
      // new Uint8Array(...) required for TS strict (BlobPart needs ArrayBuffer).
      thumbnailBlob = new Blob([new Uint8Array(bytes)], { type: thumbnailMime });
    }
  }

  return {
    totalSize: file.size,
    recompressibleBytes,
    imageCount,
    formatCounts,
    thumbnailBlob,
    thumbnailMime,
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
 * slide rels and [Content_Types].xml stay valid. A post-repackage integrity
 * check re-opens the output and verifies the entry set + slide count survived.
 */
export async function compressPptx({
  file,
  preset,
  onProgress,
}: CompressPptxOptions): Promise<CompressPptxResult> {
  onProgress?.(5);
  const originalSize = file.size;
  const ab = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);

  const originalEntryNames: string[] = [];
  const mediaPaths: string[] = [];
  let originalSlideCount = 0;

  zip.forEach((path, entry) => {
    if (entry.dir) return;
    originalEntryNames.push(path);
    if (SLIDE_RE.test(path)) originalSlideCount++;
    if (path.startsWith(MEDIA_PREFIX) && RECOMPRESSIBLE_EXTS.has(getExt(path))) {
      mediaPaths.push(path);
    }
  });

  onProgress?.(15);
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
          candidate = await recompressMedia(original, action);
        } catch {
          // Re-encode failure (corrupt/odd image) -> keep the original bytes.
          candidate = null;
        }
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
  const data = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  // Integrity: re-open the output and confirm nothing was dropped/renamed.
  const outZip = await JSZip.loadAsync(data);
  const outputEntryNames: string[] = [];
  let outputSlideCount = 0;
  outZip.forEach((path, entry) => {
    if (entry.dir) return;
    outputEntryNames.push(path);
    if (SLIDE_RE.test(path)) outputSlideCount++;
  });
  assertPptxIntegrity({
    originalEntryNames,
    outputEntryNames,
    originalSlideCount,
    outputSlideCount,
    originalSize,
    compressedSize: data.length,
  });

  onProgress?.(100);
  return {
    data,
    originalSize,
    compressedSize: data.length,
    ratio: originalSize > 0 ? data.length / originalSize : 1,
  };
}
