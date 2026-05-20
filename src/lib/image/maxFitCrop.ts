export interface ImageDims {
  w: number;
  h: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute the largest axis-aligned rectangle of target ratio (targetW : targetH)
 * that fits inside an image of dimensions `img`, centred on the image.
 *
 * Used for:
 * - aspect-ratio preset clicks (16:9 etc.) → recompute W/H + recentre crop
 * - "왜곡 없이 자르기" checkbox enable → initialise crop rect
 * - CropSelector's initial / target-changed crop placement
 *
 * Returns a zero-size rect if any input dimension is non-positive.
 */
export function maxFitCrop(
  img: ImageDims,
  targetW: number,
  targetH: number,
): CropRect {
  if (img.w <= 0 || img.h <= 0 || targetW <= 0 || targetH <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const ratioTarget = targetW / targetH;
  const ratioImage = img.w / img.h;

  let cropW: number;
  let cropH: number;
  if (ratioTarget >= ratioImage) {
    // target wider than image → width-limited
    cropW = img.w;
    cropH = Math.round((img.w * targetH) / targetW);
  } else {
    cropH = img.h;
    cropW = Math.round((img.h * targetW) / targetH);
  }

  // Clamp in case rounding pushed us one px past the bound
  cropW = Math.min(cropW, img.w);
  cropH = Math.min(cropH, img.h);

  return {
    x: Math.round((img.w - cropW) / 2),
    y: Math.round((img.h - cropH) / 2),
    width: cropW,
    height: cropH,
  };
}
