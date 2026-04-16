import imageCompression from "browser-image-compression";
import JSZip from "jszip";

export type OutputFormat = "image/jpeg" | "image/png" | "image/webp";

export interface CompressImageOptions {
  files: File[];
  quality: number;
  outputFormat: OutputFormat;
  onProgress?: (pct: number) => void;
}

export interface CompressedImage {
  name: string;
  blob: Blob;
  originalSize: number;
  compressedSize: number;
}

export interface CompressResult {
  images: CompressedImage[];
  type: "single" | "zip";
  data: Uint8Array;
  filename: string;
}

const FORMAT_EXT: Record<OutputFormat, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function convertFormat(
  file: File,
  format: OutputFormat,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          canvas.width = 0;
          canvas.height = 0;
          blob ? resolve(blob) : reject(new Error("이미지 변환 실패"));
        },
        format,
        quality / 100,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지 로드 실패"));
    };
    img.src = url;
  });
}

export async function compressImages({
  files,
  quality,
  outputFormat,
  onProgress,
}: CompressImageOptions): Promise<CompressResult> {
  const total = files.length;
  const results: CompressedImage[] = [];
  const ext = FORMAT_EXT[outputFormat];

  for (let i = 0; i < total; i++) {
    const file = files[i];
    const originalSize = file.size;

    let compressed: Blob;

    if (outputFormat === file.type && outputFormat !== "image/png") {
      compressed = await imageCompression(file, {
        maxSizeMB: Infinity,
        initialQuality: quality / 100,
        useWebWorker: true,
        fileType: outputFormat,
      });
    } else {
      compressed = await convertFormat(file, outputFormat, quality);
    }

    const baseName = file.name.replace(/\.[^.]+$/, "");
    results.push({
      name: `${baseName}.${ext}`,
      blob: compressed,
      originalSize,
      compressedSize: compressed.size,
    });

    onProgress?.(Math.round(((i + 1) / total) * 100));
  }

  if (results.length === 1) {
    const buf = await results[0].blob.arrayBuffer();
    return {
      images: results,
      type: "single",
      data: new Uint8Array(buf),
      filename: results[0].name,
    };
  }

  const zip = new JSZip();
  for (const img of results) {
    zip.file(img.name, img.blob);
  }
  const zipData = await zip.generateAsync({ type: "uint8array" });
  return {
    images: results,
    type: "zip",
    data: zipData,
    filename: "compressed-images.zip",
  };
}
