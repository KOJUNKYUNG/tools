export interface Box { x: number; y: number; w: number; h: number; }
/**
 * Fit an `imgW`×`imgH` image (native px) into `box` (inches), preserving aspect
 * (contain — never overflow), anchored to the box's TOP-LEFT corner. Returns the
 * placed rect in inches. Degenerate inputs → zero-size rect at the box origin.
 */
export function computeSlidePlacement(box: Box, imgW: number, imgH: number): Box {
  if (!(imgW > 0) || !(imgH > 0) || !(box.w > 0) || !(box.h > 0)) {
    return { x: box.x, y: box.y, w: 0, h: 0 };
  }
  const imgAspect = imgW / imgH;
  const boxAspect = box.w / box.h;
  let w: number; let h: number;
  if (imgAspect > boxAspect) { w = box.w; h = box.w / imgAspect; }
  else { h = box.h; w = box.h * imgAspect; }
  return { x: box.x, y: box.y, w, h };
}
