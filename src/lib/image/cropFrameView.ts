import type { CropRect, ImageDims } from "./maxFitCrop";

/** A rectangle on screen, in CSS pixels of the crop selector's element. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const EMPTY: Box = { x: 0, y: 0, w: 0, h: 0 };

/**
 * Where a picture of `picture`'s aspect sits inside an element of `element`
 * when drawn `object-contain`: as large as fits, centred on the short axis.
 * Empty until both sizes are known.
 */
export function containBox(element: ImageDims, picture: ImageDims): Box {
  if (element.w <= 0 || element.h <= 0 || picture.w <= 0 || picture.h <= 0) {
    return EMPTY;
  }
  const pictureRatio = picture.w / picture.h;
  // Element wider than the picture → height-limited, bars left and right.
  const heightLimited = element.w / element.h > pictureRatio;
  const w = heightLimited ? element.h * pictureRatio : element.w;
  const h = heightLimited ? element.h : element.w / pictureRatio;
  return { x: (element.w - w) / 2, y: (element.h - h) / 2, w, h };
}

/**
 * Where a frame held in `source` pixels sits on screen, given the box the
 * shown picture fills. The shown picture may be a smaller stand-in of the
 * source: only its aspect (through `box`) matters, never its pixel size.
 */
export function frameInBox(crop: CropRect, box: Box, source: ImageDims): Box {
  const sx = box.w / source.w;
  const sy = box.h / source.h;
  return {
    x: box.x + crop.x * sx,
    y: box.y + crop.y * sy,
    w: crop.width * sx,
    h: crop.height * sy,
  };
}

/**
 * A point on screen (same origin as `box`) read as `source` pixels, the
 * inverse of `frameInBox`. The mapping is linear, so the difference of two
 * points read this way is a drag distance in source pixels whatever origin
 * both share.
 */
export function pointInSource(
  point: { x: number; y: number },
  box: Box,
  source: ImageDims,
): { x: number; y: number } {
  return {
    x: ((point.x - box.x) * source.w) / box.w,
    y: ((point.y - box.y) * source.h) / box.h,
  };
}
