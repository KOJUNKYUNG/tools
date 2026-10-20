/**
 * Shared browser image resizer (spec #91): decodes an image upright (EXIF
 * orientation applied) and scales it down onto a canvas with high-quality
 * smoothing. ppt-compress uses it to shrink pictures to their display size;
 * ppt-background can reuse it.
 *
 * Large reductions halve in steps first, so a browser without high-quality
 * smoothing (Firefox samples a one-step reduction coarsely) still averages
 * every source pixel instead of skipping some. Tools resize here rather than
 * through browser-image-compression's `maxWidthOrHeight`, which scales in one
 * step at the browser's default smoothing.
 *
 * Browser-only: needs `createImageBitmap` and `OffscreenCanvas`.
 */

function context(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas context");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

/**
 * `image` decoded upright and drawn at `width`×`height`, which should not
 * exceed its upright size. The caller encodes the canvas.
 */
export async function downscaleImage(
  image: Blob,
  width: number,
  height: number,
): Promise<OffscreenCanvas> {
  const bitmap = await createImageBitmap(image, { imageOrientation: "from-image" });
  try {
    let source: ImageBitmap | OffscreenCanvas = bitmap;
    let [w, h] = [bitmap.width, bitmap.height];
    // Halve while the result stays at least the target on both sides.
    while (w >= width * 2 && h >= height * 2) {
      [w, h] = [Math.ceil(w / 2), Math.ceil(h / 2)];
      const step = new OffscreenCanvas(w, h);
      context(step).drawImage(source, 0, 0, w, h);
      if (source instanceof OffscreenCanvas) source.width = source.height = 0;
      source = step;
    }
    const out = new OffscreenCanvas(width, height);
    context(out).drawImage(source, 0, 0, width, height);
    if (source instanceof OffscreenCanvas) source.width = source.height = 0;
    return out;
  } finally {
    bitmap.close();
  }
}
