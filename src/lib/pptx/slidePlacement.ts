import type { CropRect } from "@/lib/image/maxFitCrop";
import type { PixelSize } from "@/lib/image/slideImage";

export interface Box { x: number; y: number; w: number; h: number; }
export type PlacementAlign = "top-left" | "center";

/**
 * What of a placed picture the slide shows: all of it, the part on the slide
 * (`rect` in inches, `crop` of the picture's upright pixels), or nothing.
 */
export type SlideCut =
  | { kind: "whole" }
  | { kind: "cut"; rect: Box; crop: CropRect }
  | { kind: "hidden" };

/** Float slack, in inches, for a picture flush with the slide's edge (under one EMU). */
const EDGE_SLACK_IN = 1e-6;

/** A resize handle: the box edges it moves, as compass letters ("se" = bottom-right corner). */
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/**
 * The box resized from `handle` by (`dx`, `dy`) inches from where the drag
 * began, under the placement rule. The size is held to 10–300% before the
 * moving edge is placed, so at a limit the opposite edge stays where it was.
 */
export function resizeBox(
  start: Box,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  slideW: number,
  slideH: number,
  fill?: { w: number; h: number } | null,
): Box {
  const fillW = fill?.w ?? slideW;
  const fillH = fill?.h ?? slideH;
  const size = (len: number, fillLen: number) =>
    Math.max(MIN_PLACEMENT_SHARE * fillLen, Math.min(MAX_PLACEMENT_SHARE * fillLen, len));
  const b = { ...start };
  if (handle.includes("w")) {
    b.w = size(start.w - dx, fillW);
    b.x = start.x + start.w - b.w;
  } else if (handle.includes("e")) {
    b.w = size(start.w + dx, fillW);
  }
  if (handle.includes("n")) {
    b.h = size(start.h - dy, fillH);
    b.y = start.y + start.h - b.h;
  } else if (handle.includes("s")) {
    b.h = size(start.h + dy, fillH);
  }
  return clampBox(b, slideW, slideH, fill);
}

/** Whether a rectangle (inches) reaches past the slide's edge, so the deck will cut it. */
export function reachesPastSlide(rect: Box, slideW: number, slideH: number): boolean {
  return (
    rect.x < -EDGE_SLACK_IN ||
    rect.y < -EDGE_SLACK_IN ||
    rect.x + rect.w > slideW + EDGE_SLACK_IN ||
    rect.y + rect.h > slideH + EDGE_SLACK_IN
  );
}

/**
 * Cuts a picture placed at `placed` (inches) to the slide: what lies outside
 * is cut off when the deck is made (CONTEXT "Placement"). The crop's edges
 * are rounded to whole pixels; the rectangle stays exact, so the picture
 * never pokes past the slide.
 */
export function cutAtSlide(placed: Box, slideW: number, slideH: number, picture: PixelSize): SlideCut {
  if (!reachesPastSlide(placed, slideW, slideH)) return { kind: "whole" };

  const left = Math.max(0, placed.x);
  const top = Math.max(0, placed.y);
  const right = Math.min(slideW, placed.x + placed.w);
  const bottom = Math.min(slideH, placed.y + placed.h);
  const px = (inches: number, from: number, length: number, pixels: number) =>
    Math.max(0, Math.min(pixels, Math.round(((inches - from) / length) * pixels)));
  const x0 = px(left, placed.x, placed.w, picture.width);
  const x1 = px(right, placed.x, placed.w, picture.width);
  const y0 = px(top, placed.y, placed.h, picture.height);
  const y1 = px(bottom, placed.y, placed.h, picture.height);
  if (right <= left || bottom <= top || x1 <= x0 || y1 <= y0) return { kind: "hidden" };
  return {
    kind: "cut",
    rect: { x: left, y: top, w: right - left, h: bottom - top },
    crop: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
  };
}

/** The placement box's size, as shares of the fill size (CONTEXT "Placement"). */
export const MIN_PLACEMENT_SHARE = 0.1;
export const MAX_PLACEMENT_SHARE = 3;

/**
 * One axis of the placement rule: the length between 10% and 300% of the
 * fill length; then, where it is longer than the slide, a position that
 * covers the slide (between slide − length and 0), else one inside it.
 */
function clampAxis(pos: number, len: number, slideLen: number, fillLen: number): [number, number] {
  const size = Math.max(MIN_PLACEMENT_SHARE * fillLen, Math.min(MAX_PLACEMENT_SHARE * fillLen, len));
  const room = slideLen - size;
  return [Math.max(Math.min(0, room), Math.min(pos, Math.max(0, room))), size];
}

/**
 * The placement box obeying the placement rule on each axis on its own.
 * `fill` is the fill size, the first picture as large as fits the slide; the
 * slide itself while no picture gives one.
 */
export function clampBox(b: Box, slideW: number, slideH: number, fill?: { w: number; h: number } | null): Box {
  const [x, w] = clampAxis(b.x, b.w, slideW, fill?.w ?? slideW);
  const [y, h] = clampAxis(b.y, b.h, slideH, fill?.h ?? slideH);
  return { x, y, w, h };
}
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
