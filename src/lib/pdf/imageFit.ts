// Pure geometry for placing an image on a fixed-size PDF page: preserve aspect
// ratio, upscale to fill, center, and account for clockwise page rotation.
// No pdf-lib here so the math is unit-testable in node-env.

import type { Rotation } from "./pageItem";

export interface ImageFit {
  /** Draw width in the image's own (pre-rotation) orientation, in points. */
  drawW: number;
  /** Draw height in the image's own orientation, in points. */
  drawH: number;
  /** Lower-left anchor X passed to pdf-lib drawImage. */
  x: number;
  /** Lower-left anchor Y passed to pdf-lib drawImage. */
  y: number;
  /** Counterclockwise degrees for pdf-lib drawImage `rotate` (it rotates ccw). */
  rotateDeg: number;
}

/**
 * Fit an `imgW`×`imgH` image into a `pageW`×`pageH` page (points), preserving
 * aspect ratio, upscaling allowed, centered. `rotation` is the user's clockwise
 * rotation; the returned anchor keeps the image centered after pdf-lib applies
 * `rotateDeg` (counterclockwise) about the lower-left anchor.
 */
export function computeImageFit(
  imgW: number,
  imgH: number,
  pageW: number,
  pageH: number,
  rotation: Rotation,
): ImageFit {
  const rotateDegBase = (360 - rotation) % 360; // clockwise → counterclockwise

  // Degenerate dimensions (corrupt decode, zero/NaN) → safe no-draw centered fit.
  if (!(imgW > 0) || !(imgH > 0) || !(pageW > 0) || !(pageH > 0)) {
    return { drawW: 0, drawH: 0, x: pageW / 2, y: pageH / 2, rotateDeg: rotateDegBase };
  }

  const swapped = rotation === 90 || rotation === 270;
  const effW = swapped ? imgH : imgW;
  const effH = swapped ? imgW : imgH;

  const scale = Math.min(pageW / effW, pageH / effH); // upscaling allowed
  const drawW = imgW * scale;
  const drawH = imgH * scale;

  const rotateDeg = rotateDegBase;
  const theta = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  // Center of the image relative to its lower-left anchor, rotated by theta.
  const rx = (drawW / 2) * cos - (drawH / 2) * sin;
  const ry = (drawW / 2) * sin + (drawH / 2) * cos;

  return {
    drawW,
    drawH,
    x: pageW / 2 - rx,
    y: pageH / 2 - ry,
    rotateDeg,
  };
}
