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

  // The exact largest size: target wider than image → width-limited.
  const exactW = ratioTarget >= ratioImage ? img.w : img.h * ratioTarget;
  const exactH = ratioTarget >= ratioImage ? img.w / ratioTarget : img.h;

  // Whole pixels: round the shorter side and derive the longer from it, so
  // both stay within 1 px of the ratio however wide the target (rounding
  // each apart misses by half the ratio, past 1 px beyond 2:1); step down
  // while the derived side overshoots the image.
  let cropW: number;
  let cropH: number;
  if (ratioTarget >= 1) {
    cropH = Math.max(1, Math.min(Math.round(exactH), img.h));
    cropW = Math.round(cropH * ratioTarget);
    while (cropW > img.w && cropH > 1) cropW = Math.round(--cropH * ratioTarget);
    cropW = Math.min(Math.max(1, cropW), img.w);
  } else {
    cropW = Math.max(1, Math.min(Math.round(exactW), img.w));
    cropH = Math.round(cropW / ratioTarget);
    while (cropH > img.h && cropW > 1) cropH = Math.round(--cropW / ratioTarget);
    cropH = Math.min(Math.max(1, cropH), img.h);
  }

  return {
    x: Math.round((img.w - cropW) / 2),
    y: Math.round((img.h - cropH) / 2),
    width: cropW,
    height: cropH,
  };
}

/**
 * Whether `crop` lies inside an image of `img` and holds the ratio (w / h)
 * to within 1 px on both sides, the tolerance a slide background's aspect is
 * checked to. A frame the user set earlier is reused only when it fits.
 */
export function cropFits(crop: CropRect, img: ImageDims, ratio: number): boolean {
  return (
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.x + crop.width <= img.w &&
    crop.y + crop.height <= img.h &&
    Math.abs(crop.width - crop.height * ratio) <= 1 &&
    Math.abs(crop.height - crop.width / ratio) <= 1
  );
}
