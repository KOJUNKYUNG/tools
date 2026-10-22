/**
 * Shared slide image preparation (spec #98): a picture that fills a slide is
 * cut to the slide's aspect (a Background crop, in ppt-background), made no
 * larger than a 4K screen needs in the slide's orientation, and never
 * enlarged. ppt-background is the first adopter; image-to-pptx and
 * ppt-compress can adopt the same policy (backlog S4).
 *
 * The sizing decisions are pure, so they run in Node; `prepareSlideImage`
 * does the pixels in the browser and is injectable, so engines stand it in.
 */
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

/** The format a prepared picture is saved in: a JPEG stays JPEG, anything else becomes PNG. */
export function preparedFormat(source: Uint8Array): PreparedImage["format"] {
  return readImageHeader(source)?.format === "jpeg" ? "jpeg" : "png";
}

/** Quality for a picture saved as JPEG; spec #98 measured 0.80 and 0.85 alike in size. */
const JPEG_QUALITY = 0.85;

/**
 * The browser preparer. The picture keeps its uploaded format (PNG, or JPEG
 * for a JPEG). An upright picture taken whole at its own size goes in as
 * uploaded: re-encoding it would only lose quality or grow it.
 */
export const prepareSlideImage: PrepareSlideImage = async (source, crop, slide) => {
  const bytes = new Uint8Array(await source.arrayBuffer());
  const header = readImageHeader(bytes);
  const format = preparedFormat(bytes);
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
  if (whole) return { bytes, format, ...size };

  const canvas = await downscaleImage(source, size.width, size.height, crop);
  try {
    const blob = await canvas.convertToBlob({
      type: `image/${format}`,
      quality: format === "jpeg" ? JPEG_QUALITY : undefined,
    });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), format, ...size };
  } finally {
    canvas.width = canvas.height = 0;
  }
};
