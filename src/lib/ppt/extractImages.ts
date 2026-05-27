import JSZip from "jszip";
import { extractImagesFromPpt } from "./extractImagesFromPpt";

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

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".tiff",
  ".tif",
  ".svg",
  ".emf",
  ".wmf",
]);

function isImageFile(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return IMAGE_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

function isPptFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".ppt");
}

async function extractFromPptx(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const mediaEntries: { name: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((path, entry) => {
    if (path.startsWith("ppt/media/") && !entry.dir && isImageFile(path)) {
      mediaEntries.push({ name: path.split("/").pop()!, entry });
    }
  });

  if (mediaEntries.length === 0) {
    throw new Error("PPTX 파일에서 이미지를 찾을 수 없습니다.");
  }

  const output = new JSZip();
  for (let i = 0; i < mediaEntries.length; i++) {
    const data = await mediaEntries[i].entry.async("uint8array");
    output.file(mediaEntries[i].name, data);
    onProgress?.(Math.round(((i + 1) / mediaEntries.length) * 100));
  }

  return output.generateAsync({ type: "uint8array" });
}

export async function extractPptImages({
  file,
  onProgress,
}: ExtractImagesOptions): Promise<Uint8Array> {
  if (isPptFile(file)) {
    return extractImagesFromPpt({ file, onProgress });
  }
  return extractFromPptx(file, onProgress);
}
