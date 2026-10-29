/**
 * Shared browser image resizer (spec #91): decodes an image upright (EXIF
 * orientation applied) and scales it down onto a canvas with high-quality
 * smoothing. ppt-compress uses it to shrink pictures to their display size;
 * the slide image preparer (slideImage.ts) to cut and fit backgrounds.
 *
 * Large reductions halve in steps first, so a browser without high-quality
 * smoothing (Firefox samples a one-step reduction coarsely) still averages
 * every source pixel instead of skipping some. Tools resize here rather than
 * through browser-image-compression's `maxWidthOrHeight`, which scales in one
 * step at the browser's default smoothing.
 *
 * Browser-only: needs `createImageBitmap` and `OffscreenCanvas`. The halving
 * is also drawn synchronously onto any canvas (`drawScaledDown`), for live copies.
 */
import type { Box } from "./cropFrameView";
import type { CropRect } from "./maxFitCrop";

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function context2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas context");
  return ctx;
}

function smoothHigh(ctx: Context2D): Context2D {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

/**
 * Draw the `part` rectangle of `source` onto `ctx` at 0, 0, `width` ×
 * `height`, halving it in steps first while it stays at least twice the
 * target on both sides; `ctx` is left at high-quality smoothing. Synchronous,
 * so a copy redrawn each frame (a live preview at display size) averages its
 * source as the prepared picture does. The caller's source is never changed.
 */
export function drawScaledDown(ctx: Context2D, source: CanvasImageSource, part: Box, width: number, height: number): void {
  let from: CanvasImageSource = source;
  let { x, y, w, h } = part;
  while (w >= width * 2 && h >= height * 2) {
    const [halfW, halfH] = [Math.ceil(w / 2), Math.ceil(h / 2)];
    const step = new OffscreenCanvas(halfW, halfH);
    smoothHigh(context2d(step)).drawImage(from, x, y, w, h, 0, 0, halfW, halfH);
    if (from !== source && from instanceof OffscreenCanvas) from.width = from.height = 0;
    from = step;
    [x, y, w, h] = [0, 0, halfW, halfH];
  }
  smoothHigh(ctx).drawImage(from, x, y, w, h, 0, 0, width, height);
  if (from !== source && from instanceof OffscreenCanvas) from.width = from.height = 0;
}

/**
 * `image` decoded upright, cut to `crop` (in upright pixels) when given, and
 * drawn at `width`×`height`, which should not exceed the cut's size. The
 * caller encodes the canvas. A bitmap the caller already decoded (upright)
 * is used as is and stays the caller's to close.
 */
export async function downscaleImage(
  image: Blob | ImageBitmap,
  width: number,
  height: number,
  crop?: CropRect,
): Promise<OffscreenCanvas> {
  const owned = image instanceof Blob;
  const bitmap = owned
    ? await createImageBitmap(image, { imageOrientation: "from-image" })
    : image;
  try {
    const out = new OffscreenCanvas(width, height);
    // The cut is the source rectangle of the first draw, taken from the
    // upright bitmap (createImageBitmap's own source rectangle may be applied
    // before the EXIF turn). It is never copied at full size first: a phone
    // photo's cut can pass iOS Safari's ~16.7 MP canvas limit.
    const cut = crop
      ? { x: crop.x, y: crop.y, w: crop.width, h: crop.height }
      : { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
    drawScaledDown(context2d(out), bitmap, cut, width, height);
    return out;
  } finally {
    if (owned) bitmap.close();
  }
}
