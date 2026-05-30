export interface Box { x: number; y: number; w: number; h: number; }
export type PlacementAlign = "top-left" | "center";
/**
 * Fit an `imgW`×`imgH` image (native px) into `box` (inches), preserving aspect
 * (contain — never overflow). Anchored to the box's TOP-LEFT corner by default,
 * or centered if `align === "center"`. Returns the placed rect in inches.
 * Degenerate inputs → zero-size rect at the box origin.
 */
export function computeSlidePlacement(box: Box, imgW: number, imgH: number, align: PlacementAlign = "top-left"): Box {
  if (!(imgW > 0) || !(imgH > 0) || !(box.w > 0) || !(box.h > 0)) {
    return { x: box.x, y: box.y, w: 0, h: 0 };
  }
  const imgAspect = imgW / imgH;
  const boxAspect = box.w / box.h;
  let w: number; let h: number;
  if (imgAspect > boxAspect) { w = box.w; h = box.w / imgAspect; }
  else { h = box.h; w = box.h * imgAspect; }
  let x = box.x; let y = box.y;
  if (align === "center") { x = box.x + (box.w - w) / 2; y = box.y + (box.h - h) / 2; }
  return { x, y, w, h };
}
