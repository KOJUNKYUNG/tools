export interface ResizePreset {
  labelKey: string;
  width: number;
  height: number;
}

export const RESIZE_PRESETS: ResizePreset[] = [
  { labelKey: "fhd", width: 1920, height: 1080 },
  { labelKey: "hd", width: 1280, height: 720 },
  { labelKey: "square", width: 1080, height: 1080 },
  { labelKey: "mobile", width: 390, height: 844 },
  { labelKey: "uhd4k", width: 3840, height: 2160 },
  { labelKey: "instaPortrait", width: 1080, height: 1350 },
];

export interface AspectPreset {
  label: string;
  w: number;
  h: number;
}

export const ASPECT_PRESETS: AspectPreset[] = [
  { label: "1:1", w: 1, h: 1 },
  { label: "16:9", w: 16, h: 9 },
  { label: "9:16", w: 9, h: 16 },
  { label: "4:3", w: 4, h: 3 },
  { label: "3:4", w: 3, h: 4 },
  { label: "3:2", w: 3, h: 2 },
  { label: "2:3", w: 2, h: 3 },
];

export type ResizeMode = "pixel" | "percent" | "preset";

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResizeImageOptions {
  file: File;
  mode: ResizeMode;
  width?: number;
  height?: number;
  percent?: number;
  lockAspectRatio?: boolean;
  crop?: CropArea;
  outputFormat?: string;
  quality?: number;
}

export interface ResizeResult {
  blob: Blob;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지 로드 실패"));
    };
    img.src = url;
  });
}

export async function resizeImage(opts: ResizeImageOptions): Promise<ResizeResult> {
  const img = await loadImage(opts.file);
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

  let targetW: number;
  let targetH: number;

  if (opts.mode === "percent") {
    const pct = (opts.percent ?? 100) / 100;
    targetW = Math.round(origW * pct);
    targetH = Math.round(origH * pct);
  } else if (opts.mode === "preset" || opts.mode === "pixel") {
    targetW = opts.width ?? origW;
    targetH = opts.height ?? origH;

    if (opts.lockAspectRatio && opts.mode === "pixel") {
      const aspect = origW / origH;
      if (opts.width && !opts.height) {
        targetH = Math.round(targetW / aspect);
      } else if (opts.height && !opts.width) {
        targetW = Math.round(targetH * aspect);
      }
    }
  } else {
    targetW = origW;
    targetH = origH;
  }

  targetW = Math.max(1, targetW);
  targetH = Math.max(1, targetH);

  const sx = opts.crop?.x ?? 0;
  const sy = opts.crop?.y ?? 0;
  const sw = opts.crop?.width ?? origW;
  const sh = opts.crop?.height ?? origH;

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);

  const format = opts.outputFormat ?? (opts.file.type || "image/png");
  const quality = (opts.quality ?? 92) / 100;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("이미지 변환 실패"))),
      format,
      quality,
    );
  });

  canvas.width = 0;
  canvas.height = 0;

  return {
    blob,
    width: targetW,
    height: targetH,
    originalWidth: origW,
    originalHeight: origH,
  };
}
