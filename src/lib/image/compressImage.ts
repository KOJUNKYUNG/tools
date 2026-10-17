import JSZip from "jszip";
import { uniqueNames } from "@/lib/common/uniqueNames";
import { OutputCheckError, runOutputCheck } from "@/lib/output-check/core";
import { SIZE_BOUND } from "@/lib/output-check/sizeBound";
import { checkCompressedImage, checkCompressZip } from "./compressImageCheck";
import { isConvertedFromHeic } from "./heic";

export type OutputFormat = "image/jpeg" | "image/png" | "image/webp";

export interface CompressImageOptions {
  files: File[];
  quality: number;
  outputFormat: OutputFormat;
  onProgress?: (pct: number) => void;
}

export interface CompressedImage {
  /** Output name, unique within the result. */
  name: string;
  /** What the result holds for this file: the output, or the kept original. */
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  /**
   * The file kept its format and did not get smaller, so the result holds the
   * original instead (in a batch zip), never passed off as compressed.
   */
  keptOriginal: boolean;
}

export type CompressResult =
  | {
      kind: "compressed";
      images: CompressedImage[];
      type: "single" | "zip";
      data: Uint8Array;
      filename: string;
    }
  /** No file could shrink: a "could not shrink" result, nothing to download. */
  | { kind: "not-smaller"; images: CompressedImage[] };

/** Encodes `file` as `format` at `quality` (0–100). */
type Encode = (file: File, format: OutputFormat, quality: number) => Promise<Blob>;

export interface ImageEncoders {
  /** Same-format lossy compression (browser-image-compression). */
  compress: Encode;
  /** A plain canvas redraw: format conversion, PNG, and the recovery. */
  redraw: Encode;
}

/**
 * The browser cannot encode the requested format: a canvas asked for one it
 * does not support writes PNG instead (Safari and WebP). No recovery exists,
 * so the tool asks for another format.
 */
export class OutputFormatUnsupportedError extends Error {
  constructor(readonly format: OutputFormat) {
    super(`the browser cannot encode ${format}`);
    this.name = "OutputFormatUnsupportedError";
  }
}

const FORMAT_EXT: Record<OutputFormat, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function redrawOnCanvas(
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

const browserEncoders: ImageEncoders = {
  compress: async (file, format, quality) => {
    const { default: imageCompression } = await import("browser-image-compression");
    return imageCompression(file, {
      maxSizeMB: Infinity,
      initialQuality: quality / 100,
      useWebWorker: true,
      fileType: format,
    });
  },
  redraw: redrawOnCanvas,
};

/**
 * Encode one file and check it (spec #51, #60). A same-format output that is
 * not smaller keeps the original: that is an outcome, so it is settled before
 * the damage check (nothing of the output is offered).
 */
async function compressOne(
  file: File,
  outputFormat: OutputFormat,
  quality: number,
  encoders: ImageEncoders,
): Promise<{ blob: Blob; keptOriginal: boolean }> {
  const sameFormat = file.type === outputFormat && !isConvertedFromHeic(file);
  const viaLibrary = file.type === outputFormat && outputFormat !== "image/png";
  const encode = viaLibrary ? encoders.compress : encoders.redraw;
  const notSmaller = (out: Blob) => sameFormat && out.size >= file.size;

  const encoded = await encode(file, outputFormat, quality);
  if (notSmaller(encoded)) return { blob: file, keptOriginal: true };

  let checked: Blob;
  try {
    checked = await runOutputCheck({
      tool: "image-compress",
      output: encoded,
      // The size bound is settled here, not by blocking.
      check: async (out) =>
        (
          await checkCompressedImage(file, { format: outputFormat, sameFormat }, out, "quick")
        ).filter((v) => v.property !== SIZE_BOUND),
      // A safer encode: the canvas draws the image as the browser shows it,
      // at its full size, where the library may scale or turn it.
      recover: viaLibrary ? () => encoders.redraw(file, outputFormat, quality) : undefined,
    });
  } catch (err) {
    if (err instanceof OutputCheckError && err.violations.some((v) => v.property === "image-format")) {
      throw new OutputFormatUnsupportedError(outputFormat);
    }
    throw err;
  }
  // A recovery may come out larger than the input.
  if (notSmaller(checked)) return { blob: file, keptOriginal: true };
  return { blob: checked, keptOriginal: false };
}

export async function compressImages(
  { files, quality, outputFormat, onProgress }: CompressImageOptions,
  encoders: ImageEncoders = browserEncoders,
): Promise<CompressResult> {
  const total = files.length;
  const ext = FORMAT_EXT[outputFormat];
  const names = uniqueNames(files.map((f) => `${f.name.replace(/\.[^.]+$/, "")}.${ext}`));
  const results: CompressedImage[] = [];

  for (let i = 0; i < total; i++) {
    const file = files[i];
    const { blob, keptOriginal } = await compressOne(file, outputFormat, quality, encoders);
    results.push({
      name: names[i],
      blob,
      originalSize: file.size,
      compressedSize: blob.size,
      keptOriginal,
    });
    onProgress?.(Math.round(((i + 1) / total) * 100));
  }

  if (results.every((img) => img.keptOriginal)) {
    return { kind: "not-smaller", images: results };
  }

  if (results.length === 1) {
    const buf = await results[0].blob.arrayBuffer();
    return {
      kind: "compressed",
      images: results,
      type: "single",
      data: new Uint8Array(buf),
      filename: results[0].name,
    };
  }

  const zip = new JSZip();
  for (const img of results) {
    zip.file(img.name, new Uint8Array(await img.blob.arrayBuffer()));
  }
  const zipData = await zip.generateAsync({ type: "uint8array" });
  // No recovery: the names are already unique.
  const checkedZip = await runOutputCheck({
    tool: "image-compress",
    output: zipData,
    check: (out) => checkCompressZip(total, undefined, out, "quick"),
  });
  return {
    kind: "compressed",
    images: results,
    type: "zip",
    data: checkedZip,
    filename: "compressed-images.zip",
  };
}
