import JSZip from "jszip";
import { runOutputCheck } from "@/lib/output-check/core";
import { checkPptExtract } from "./extractImagesCheck";
import { extractImagesFromPpt } from "./extractImagesFromPpt";
import { getExt, getMime, isImageMediaPath, isRenderable } from "./pptImageFormats";

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

function isPptFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".ppt");
}

async function extractFromPptx(
  bytes: Uint8Array,
  onProgress?: (pct: number) => void,
): Promise<ExtractedImage[]> {
  const zip = await JSZip.loadAsync(bytes);

  const mediaEntries: { name: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((path, entry) => {
    if (!entry.dir && isImageMediaPath(path)) {
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

/**
 * Extract every image in the deck, checked before it is handed over (see
 * `checkPptExtract`). No recovery exists: a file that fails the check
 * blocks the result rather than being dropped from it.
 */
export async function extractPptImages({
  file,
  onProgress,
}: ExtractImagesOptions): Promise<ExtractedImage[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const images = isPptFile(file)
    ? await extractImagesFromPpt({ bytes, onProgress })
    : await extractFromPptx(bytes, onProgress);
  return runOutputCheck({
    tool: "ppt-extract",
    output: images,
    check: (out) => checkPptExtract(bytes, undefined, out, "quick"),
  });
}

// Re-export for downstream convenience.
export { isRenderable, getExt, getMime };
