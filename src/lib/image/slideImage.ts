/**
 * Shared slide image preparation (spec #98): a picture that fills a slide is
 * cut to the slide's aspect (a Background crop, in ppt-background), made no
 * larger than a 4K screen needs in the slide's orientation, never enlarged,
 * and saved as JPEG when that is much smaller. ppt-background is the first
 * adopter; image-to-pptx and ppt-compress can adopt the same policy
 * (backlog S4).
 *
 * The sizing and format decisions are pure, so they run in Node;
 * `prepareSlideImage` does the pixels in the browser and is injectable, so
 * engines stand it in.
 */
import { INVALID_INPUT_PREFIX } from "@/lib/errors";
import { hasUnreadOrientation, readImageHeader } from "@/lib/output-check/imageHeader";
import { downscaleImage } from "./downscale";
import type { CropRect } from "./maxFitCrop";

/** A slide's size in any unit (EMU from `<p:sldSz>`); only its shape matters. */
export interface SlideSize {
  w: number;
  h: number;
}

export interface PixelSize {
  width: number;
  height: number;
}

/** A 4K screen in the slide's orientation: landscape (and square) or portrait. */
export function screenBox(slide: SlideSize): PixelSize {
  return slide.w >= slide.h ? { width: 3840, height: 2160 } : { width: 2160, height: 3840 };
}

/**
 * The pixel size a crop of the slide's aspect is stored at: the crop's own
 * size when it fits the 4K box, otherwise scaled down until the side that
 * binds first meets the box, the other side following the slide's aspect.
 * Never larger than the crop on either side.
 */
export function fittedSize(crop: CropRect, slide: SlideSize): PixelSize {
  const box = screenBox(slide);
  const widthScale = box.width / crop.width;
  const heightScale = box.height / crop.height;
  if (widthScale >= 1 && heightScale >= 1) return { width: crop.width, height: crop.height };

  const ratio = slide.w / slide.h;
  if (widthScale <= heightScale) {
    const width = box.width;
    return { width, height: Math.min(box.height, crop.height, Math.round(width / ratio)) };
  }
  const height = box.height;
  return { width: Math.min(box.width, crop.width, Math.round(height * ratio)), height };
}

/**
 * Whether a crop is too small to fill a Full HD screen without being
 * enlarged, so it may look blurry there: its long side in the slide's
 * orientation (width, or height for a portrait slide) is under 1920 pixels.
 */
export function belowFullHd(crop: CropRect, slide: SlideSize): boolean {
  return (slide.w >= slide.h ? crop.width : crop.height) < 1920;
}

export interface PreparedImage {
  bytes: Uint8Array;
  format: "png" | "jpeg";
  width: number;
  height: number;
}

/**
 * Prepares `source` for a slide of `slide`'s shape: cut to `crop` (in the
 * source's upright pixels, of the slide's aspect), then fitted.
 */
export type PrepareSlideImage = (
  source: Blob,
  crop: CropRect,
  slide: SlideSize,
) => Promise<PreparedImage>;

/**
 * The format a prepared picture is saved in (spec #98): a picture whose alpha
 * is used stays PNG; otherwise JPEG when it is at most half the PNG's size,
 * so photos become JPEG while flat graphics and text, which JPEG barely
 * shrinks and visibly blurs, stay PNG. Measured for ppt-compress; no separate
 * photo detector is needed.
 */
export function preparedFormat({
  alphaUsed,
  jpegBytes,
  pngBytes,
}: {
  alphaUsed: boolean;
  /** Sizes of the picture encoded both ways (JPEG at quality 0.85). */
  jpegBytes: number;
  pngBytes: number;
}): PreparedImage["format"] {
  return !alphaUsed && jpegBytes * 2 <= pngBytes ? "jpeg" : "png";
}

/** Quality for a picture saved as JPEG; spec #98 measured 0.80 and 0.85 alike in size. */
const JPEG_QUALITY = 0.85;

/** Rows scanned at a time for transparency: bounds the pixel buffer to ~16 MB. */
const SCAN_PIXELS = 4_000_000;

/** Whether any pixel of `bitmap` is less than fully opaque, read in bands. */
function alphaUsed(bitmap: ImageBitmap): boolean {
  const { width, height } = bitmap;
  const band = Math.max(1, Math.min(height, Math.floor(SCAN_PIXELS / width)));
  const canvas = new OffscreenCanvas(width, band);
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d canvas context");
    for (let y = 0; y < height; y += band) {
      const rows = Math.min(band, height - y);
      ctx.clearRect(0, 0, width, band);
      ctx.drawImage(bitmap, 0, y, width, rows, 0, 0, width, rows);
      const pixels = ctx.getImageData(0, 0, width, rows).data;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) return true;
    }
    return false;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

async function encode(canvas: OffscreenCanvas, format: PreparedImage["format"]): Promise<Uint8Array> {
  const blob = await canvas.convertToBlob({
    type: `image/${format}`,
    quality: format === "jpeg" ? JPEG_QUALITY : undefined,
  });
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * The browser preparer: cut, fit, then save as `preparedFormat` decides,
 * scanning a PNG's pixels for transparency (a JPEG has none). A picture
 * taken whole at its own size that stays in its format goes in as uploaded:
 * re-encoding it could only lose quality or grow it. So a whole JPEG is
 * never re-encoded, and a whole PNG is re-encoded only to measure the rule.
 */
export const prepareSlideImage: PrepareSlideImage = async (source, crop, slide) => {
  const bytes = new Uint8Array(await source.arrayBuffer());
  const header = readImageHeader(bytes);
  const size = fittedSize(crop, slide);

  const whole =
    header !== null &&
    header.format !== "webp" &&
    header.orientation === 1 &&
    !hasUnreadOrientation(bytes) &&
    crop.x === 0 &&
    crop.y === 0 &&
    crop.width === header.width &&
    crop.height === header.height &&
    size.width === crop.width &&
    size.height === crop.height;
  if (whole && header.format === "jpeg") return { bytes, format: "jpeg", ...size };

  // The <img> that measured the picture may decode what createImageBitmap
  // cannot; either way the file is the problem, not the tool.
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" }).catch(() => {
    throw new Error(`${INVALID_INPUT_PREFIX}: the background image could not be decoded`);
  });
  try {
    const alpha = header?.format !== "jpeg" && alphaUsed(bitmap);
    if (whole && alpha) return { bytes, format: "png", ...size };
    const canvas = await downscaleImage(bitmap, size.width, size.height, crop);
    try {
      // Measured on the canvas's own PNG, not the upload's: a badly
      // compressed graphic would otherwise look worth turning into JPEG.
      const png = await encode(canvas, "png");
      const jpeg = alpha ? null : await encode(canvas, "jpeg");
      if (jpeg && preparedFormat({ alphaUsed: alpha, jpegBytes: jpeg.length, pngBytes: png.length }) === "jpeg") {
        return { bytes: jpeg, format: "jpeg", ...size };
      }
      return { bytes: whole ? bytes : png, format: "png", ...size };
    } finally {
      canvas.width = canvas.height = 0;
    }
  } finally {
    bitmap.close();
  }
};
