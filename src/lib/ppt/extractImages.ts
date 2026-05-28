import JSZip from "jszip";
import { extractImagesFromPpt } from "./extractImagesFromPpt";
import { getExt, getMime, isRenderable } from "./pptImageFormats";

export interface ExtractedImage {
  name: string;
  data: Uint8Array;
  mime: string;
  size: number;
}

export interface ExtractImagesOptions {
  file: File;
  onProgress?: (pct: number) => void;
}

const SUPPORTED_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp",
  "tiff", "tif", "svg", "emf", "wmf",
]);

function isImageFile(name: string): boolean {
  return SUPPORTED_EXTENSIONS.has(getExt(name));
}

function isPptFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".ppt");
}

async function extractFromPptx(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<ExtractedImage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const mediaEntries: { name: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((path, entry) => {
    if (path.startsWith("ppt/media/") && !entry.dir && isImageFile(path)) {
      mediaEntries.push({ name: path.split("/").pop()!, entry });
    }
  });

  if (mediaEntries.length === 0) {
    throw new Error("NO_IMAGES");
  }

  // Inflate up to INFLATE_CONCURRENCY entries at a time. Sequential awaits
  // were ~linear in entry count; full Promise.all spikes memory on large
  // decks (e.g. 200 entries × ~2MB each). 8 keeps the working set bounded
  // while still hiding I/O latency across cores.
  const INFLATE_CONCURRENCY = 8;
  const images: ExtractedImage[] = new Array(mediaEntries.length);
  let done = 0;
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= mediaEntries.length) return;
      const { name, entry } = mediaEntries[i];
      const data = await entry.async("uint8array");
      images[i] = {
        name,
        data,
        mime: getMime(getExt(name)),
        size: data.length,
      };
      done++;
      onProgress?.(Math.round((done / mediaEntries.length) * 100));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(INFLATE_CONCURRENCY, mediaEntries.length) }, () =>
      worker(),
    ),
  );
  return images;
}

export async function extractPptImages({
  file,
  onProgress,
}: ExtractImagesOptions): Promise<ExtractedImage[]> {
  if (isPptFile(file)) {
    return extractImagesFromPpt({ file, onProgress });
  }
  return extractFromPptx(file, onProgress);
}

// Re-export for downstream convenience.
export { isRenderable, getExt, getMime };
