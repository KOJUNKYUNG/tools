/**
 * Shared slide image preparation (spec #98): a picture going into a slide
 * holds no more pixels than it shows with the slide filling a screen (CONTEXT
 * "Screen size"), is never enlarged, and is saved as JPEG when that is much
 * smaller. ppt-background cuts its picture to the slide's aspect (a Background
 * crop) on a 4K screen; image-to-pptx (spec #147) keeps its pictures whole, on
 * the screen size the deck asks for. ppt-compress can adopt the same policy.
 *
 * The sizing and format decisions are pure, so they run in Node;
 * `prepareSlideImage` does the pixels in the browser and is injectable, so
 * engines stand it in.
 */
import { INVALID_INPUT_PREFIX } from "@/lib/errors";
import { displayedSize, hasUnreadOrientation, readImageHeader } from "@/lib/output-check/imageHeader";
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

/** The screen a deck's pictures are sized for (CONTEXT "Screen size"). */
export type ScreenSize = "full-hd" | "4k";

const SCREEN_SIDES: Readonly<Record<ScreenSize, { long: number; short: number }>> = {
  "full-hd": { long: 1920, short: 1080 },
  "4k": { long: 3840, short: 2160 },
};

/** The screen in the slide's orientation: landscape (and square) or portrait. */
export function screenBox(slide: SlideSize, screen: ScreenSize = "4k"): PixelSize {
  const { long, short } = SCREEN_SIDES[screen];
  return slide.w >= slide.h ? { width: long, height: short } : { width: short, height: long };
}

/**
 * The pixel size a crop of the slide's aspect is stored at: the crop's own
 * size when it fits the screen's box, otherwise scaled down until the side
 * that binds first meets the box, the other side following the slide's
 * aspect. Never larger than the crop on either side.
 */
export function fittedSize(crop: CropRect, slide: SlideSize, screen: ScreenSize = "4k"): PixelSize {
  const box = screenBox(slide, screen);
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
 * The largest picture of the slide's aspect the screen holds, the slide's
 * rectangle on it: what a crop of any larger picture is stored at, so the size
 * a picture made for the slide (a filtered solid colour) is drawn at.
 */
export function filledSize(slide: SlideSize, screen: ScreenSize = "4k"): PixelSize {
  const box = screenBox(slide, screen);
  const ratio = slide.w / slide.h;
  if (ratio >= box.width / box.height) return { width: box.width, height: Math.round(box.width / ratio) };
  return { width: Math.round(box.height * ratio), height: box.height };
}

/**
 * The size a whole picture of any shape is stored at: scaled down until it
 * fits inside the slide's rectangle on the screen, keeping its shape, and
 * never enlarged.
 */
export function containedSize(picture: PixelSize, slide: SlideSize, screen: ScreenSize = "4k"): PixelSize {
  const rectangle = filledSize(slide, screen);
  const scale = Math.min(rectangle.width / picture.width, rectangle.height / picture.height);
  if (scale >= 1) return picture;
  return {
    width: Math.max(1, Math.round(picture.width * scale)),
    height: Math.max(1, Math.round(picture.height * scale)),
  };
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

/** Prepares `source`: cut to `crop` (in its upright pixels), then drawn at `size`. */
export type PrepareSizedImage = (
  source: Blob,
  crop: CropRect,
  size: PixelSize,
) => Promise<PreparedImage>;

/**
 * What an engine sizing pictures itself needs: a picture's upright size, to
 * work out the crop and the size, then the preparation. Tests and Node stand
 * it in for the canvas.
 */
export interface SizedImagePreparation {
  measure(source: Blob): Promise<PixelSize>;
  prepare: PrepareSizedImage;
}

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

/** Whether any pixel of `picture` is less than fully opaque, read in bands. */
function alphaUsed(picture: ImageBitmap | OffscreenCanvas): boolean {
  const { width, height } = picture;
  const band = Math.max(1, Math.min(height, Math.floor(SCAN_PIXELS / width)));
  const canvas = new OffscreenCanvas(width, band);
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d canvas context");
    for (let y = 0; y < height; y += band) {
      const rows = Math.min(band, height - y);
      ctx.clearRect(0, 0, width, band);
      ctx.drawImage(picture, 0, y, width, rows, 0, 0, width, rows);
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
 * A change to the picture between its fit and its encoding, such as effects
 * baked into its pixels: given the fitted picture, it returns the picture to
 * encode, the same canvas or a new one of the same size (the prepared
 * picture states the fitted size).
 */
export type PrepareStep = (fitted: OffscreenCanvas) => OffscreenCanvas | Promise<OffscreenCanvas>;

/**
 * Whether `crop` at `size` is the upload itself: all of it, upright as
 * stored, at its own size, in a format a deck takes as is. Such a picture
 * can go in as uploaded when it stays in its format.
 */
export function takenWhole(bytes: Uint8Array, crop: CropRect, size: PixelSize): boolean {
  const header = readImageHeader(bytes);
  return (
    header !== null &&
    header.format !== "webp" &&
    header.orientation === 1 &&
    !hasUnreadOrientation(bytes) &&
    crop.x === 0 &&
    crop.y === 0 &&
    crop.width === header.width &&
    crop.height === header.height &&
    size.width === crop.width &&
    size.height === crop.height
  );
}

/** `source` decoded upright. A failure means the file is the problem, not the tool. */
function decodeUpright(source: Blob): Promise<ImageBitmap> {
  return createImageBitmap(source, { imageOrientation: "from-image" }).catch(() => {
    throw new Error(`${INVALID_INPUT_PREFIX}: the picture could not be decoded`);
  });
}

/**
 * `source`'s size as it shows, upright: from its header, without decoding it,
 * unless it carries orientation metadata the header reader does not read.
 */
export async function uprightSize(source: Blob): Promise<PixelSize> {
  const bytes = new Uint8Array(await source.arrayBuffer());
  const header = readImageHeader(bytes);
  if (header && !hasUnreadOrientation(bytes)) {
    const [width, height] = displayedSize(header);
    return { width, height };
  }
  const bitmap = await decodeUpright(source);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/**
 * The browser preparer, its size from the caller: cut, draw at `size`, run
 * `step` when given, then save as `preparedFormat` decides, scanning a PNG's
 * pixels for transparency (a JPEG has none). Without a step, a picture taken
 * whole at its own size that stays in its format goes in as uploaded:
 * re-encoding it could only lose quality or grow it. So a whole JPEG is never
 * re-encoded, and a whole PNG is re-encoded only to measure the rule. A step
 * changes the pixels, so its picture is always encoded, and scanned for
 * transparency as it comes out.
 */
export function sizedImagePreparer(step?: PrepareStep): PrepareSizedImage {
  return async (source, crop, size) => {
    const bytes = new Uint8Array(await source.arrayBuffer());
    const header = readImageHeader(bytes);
    const whole = !step && takenWhole(bytes, crop, size);

    // Decoded even when it goes in as uploaded: nothing else proves the
    // picture opens, and a slide holding one that does not is a silent fault.
    const bitmap = await decodeUpright(source);
    let canvas: OffscreenCanvas | null = null;
    try {
      if (whole && header?.format === "jpeg") return { bytes, format: "jpeg", ...size };
      const sourceAlpha = !step && header?.format !== "jpeg" && alphaUsed(bitmap);
      if (whole && sourceAlpha) return { bytes, format: "png", ...size };
      canvas = await downscaleImage(bitmap, size.width, size.height, crop);
      if (step) {
        const fitted = canvas;
        canvas = await step(fitted);
        if (canvas !== fitted) fitted.width = fitted.height = 0;
      }
      // A step may change the transparency, so its picture is scanned as it comes out.
      const alpha = step ? alphaUsed(canvas) : sourceAlpha;
      // Measured on the canvas's own PNG, not the upload's: a badly
      // compressed graphic would otherwise look worth turning into JPEG.
      const png = await encode(canvas, "png");
      const jpeg = alpha ? null : await encode(canvas, "jpeg");
      if (jpeg && preparedFormat({ alphaUsed: alpha, jpegBytes: jpeg.length, pngBytes: png.length }) === "jpeg") {
        return { bytes: jpeg, format: "jpeg", ...size };
      }
      return { bytes: whole ? bytes : png, format: "png", ...size };
    } finally {
      if (canvas) canvas.width = canvas.height = 0;
      bitmap.close();
    }
  };
}

/** The sized preparer for a crop of the slide's aspect, fitted inside 4K. */
export function slideImagePreparer(step?: PrepareStep): PrepareSlideImage {
  const prepare = sizedImagePreparer(step);
  return (source, crop, slide) => prepare(source, crop, fittedSize(crop, slide));
}

/** The shared preparation with no step. */
export const prepareSlideImage: PrepareSlideImage = slideImagePreparer();

/** The shared preparation for an engine that sizes pictures itself. */
export const sizedImagePreparation: SizedImagePreparation = {
  measure: uprightSize,
  prepare: sizedImagePreparer(),
};
