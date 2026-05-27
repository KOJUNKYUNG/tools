import JSZip from "jszip";
import CFB from "cfb";
import { getExt, getMime } from "./pptImageFormats";

export interface PresentationAnalysis {
  imageCount: number;
  formatCounts: Record<string, number>;
  thumbnailBlob: Blob | null;
  thumbnailMime: string | null;
}

const SUPPORTED_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp",
  "tiff", "tif", "svg", "emf", "wmf",
]);

// ---- Pure aggregation (unit-tested) ----

export function aggregateFormats(names: string[]): {
  imageCount: number;
  formatCounts: Record<string, number>;
} {
  const formatCounts: Record<string, number> = {};
  let imageCount = 0;
  for (const name of names) {
    const ext = getExt(name);
    if (!ext) continue;
    formatCounts[ext] = (formatCounts[ext] ?? 0) + 1;
    imageCount++;
  }
  return { imageCount, formatCounts };
}

const THUMBNAIL_PRIORITY = ["jpeg", "jpg", "png"];

export function pickThumbnailPath(paths: string[]): string | null {
  // Index paths by lowercase ext, restricted to docProps/thumbnail.*
  const byExt = new Map<string, string>();
  for (const p of paths) {
    const lower = p.toLowerCase();
    if (!lower.startsWith("docprops/thumbnail.")) continue;
    const ext = getExt(p);
    if (!byExt.has(ext)) byExt.set(ext, p);
  }
  for (const ext of THUMBNAIL_PRIORITY) {
    const found = byExt.get(ext);
    if (found) return found;
  }
  return null;
}

// ---- File IO (integration; tested via UI) ----

function isPptFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".ppt");
}

async function analyzePptx(file: File): Promise<PresentationAnalysis> {
  const ab = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);

  const allPaths: string[] = [];
  const mediaNames: string[] = [];
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    allPaths.push(path);
    if (path.startsWith("ppt/media/")) {
      const base = path.split("/").pop();
      if (base && SUPPORTED_EXTENSIONS.has(getExt(base))) {
        mediaNames.push(base);
      }
    }
  });

  const { imageCount, formatCounts } = aggregateFormats(mediaNames);

  const thumbPath = pickThumbnailPath(allPaths);
  let thumbnailBlob: Blob | null = null;
  let thumbnailMime: string | null = null;
  if (thumbPath) {
    const entry = zip.file(thumbPath);
    if (entry) {
      const bytes = await entry.async("uint8array");
      thumbnailMime = getMime(getExt(thumbPath));
      thumbnailBlob = new Blob([new Uint8Array(bytes)], { type: thumbnailMime });
    }
  }

  return { imageCount, formatCounts, thumbnailBlob, thumbnailMime };
}

async function analyzePpt(file: File): Promise<PresentationAnalysis> {
  // Re-use parseBlipRecords logic by importing the extractor and counting.
  // To avoid coupling, we do a minimal local count here using the same
  // BLIP record types — keeps this module standalone for the .ppt path.
  const ab = await file.arrayBuffer();
  const cfb = CFB.read(new Uint8Array(ab), { type: "array" });

  let picturesData: Uint8Array | null = null;
  for (const entry of cfb.FileIndex) {
    if (entry.name === "Pictures" && entry.content) {
      const raw = entry.content;
      picturesData = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      break;
    }
  }

  if (!picturesData || picturesData.length === 0) {
    return { imageCount: 0, formatCounts: {}, thumbnailBlob: null, thumbnailMime: null };
  }

  // Walk BLIP records, collect ext names only (we don't need the bytes here).
  const BLIP_EXT: Record<number, string> = {
    0xf01a: "emf",
    0xf01b: "wmf",
    0xf01d: "jpg",
    0xf01e: "png",
    0xf01f: "bmp",
    0xf029: "tiff",
  };

  const names: string[] = [];
  function walk(data: Uint8Array): void {
    let offset = 0;
    while (offset + 8 <= data.length) {
      const recVerInstance = data[offset] | (data[offset + 1] << 8);
      const recType = data[offset + 2] | (data[offset + 3] << 8);
      const recLen =
        data[offset + 4] |
        (data[offset + 5] << 8) |
        (data[offset + 6] << 16) |
        (data[offset + 7] << 24);
      if (recLen <= 0 || offset + 8 + recLen > data.length) break;
      const ext = BLIP_EXT[recType];
      if (ext) {
        names.push(`x.${ext}`); // dummy name, only ext matters for aggregation
      } else if ((recVerInstance & 0x0f) === 0x0f) {
        walk(data.slice(offset + 8, offset + 8 + recLen));
      }
      offset += 8 + recLen;
    }
  }
  walk(picturesData);

  const { imageCount, formatCounts } = aggregateFormats(names);
  return { imageCount, formatCounts, thumbnailBlob: null, thumbnailMime: null };
}

export async function analyzePresentation(file: File): Promise<PresentationAnalysis> {
  if (isPptFile(file)) return analyzePpt(file);
  return analyzePptx(file);
}
