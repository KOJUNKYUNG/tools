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

  const images: ExtractedImage[] = [];
  for (let i = 0; i < mediaEntries.length; i++) {
    const data = await mediaEntries[i].entry.async("uint8array");
    const name = mediaEntries[i].name;
    images.push({
      name,
      data,
      mime: getMime(getExt(name)),
      size: data.length,
    });
    onProgress?.(Math.round(((i + 1) / mediaEntries.length) * 100));
  }
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
