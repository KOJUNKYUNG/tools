import type { CropRect } from "@/lib/image/maxFitCrop";
import type { PixelSize } from "@/lib/image/slideImage";

export interface Box { x: number; y: number; w: number; h: number; }
/** The fill size (inches): the first picture as large as fits the slide, 100% of the placement size. */
export interface FillSize { w: number; h: number }
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

/**
 * The slides, numbered from 1, whose picture the frame `box` puts wholly off
 * the slide, so the deck shows the background alone there (`cutAtSlide`'s
 * "hidden"). The frame is placed with the first picture in view, so a later
 * picture of another shape can fall off unnoticed: the tool warns before the
 * deck is made.
 */
export function slidesWithPictureOff(
  box: Box,
  align: PlacementAlign,
  slideW: number,
  slideH: number,
  pictures: readonly PixelSize[],
): number[] {
  const off: number[] = [];
  pictures.forEach((picture, i) => {
    const placed = computeSlidePlacement(box, picture.width, picture.height, align);
    if (cutAtSlide(placed, slideW, slideH, picture).kind === "hidden") off.push(i + 1);
  });
  return off;
}

/** A resize handle: the box edges it moves, as compass letters ("se" = bottom-right corner). */
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/**
 * A resize with width and height locked: one share of the fill size, taken
 * from the edge the handle moves (a corner: whichever moved further), held to
 * 10–300%. The edges opposite the handle stay put; on an axis the handle does
 * not move, the box grows around its middle.
 */
function lockedResize(start: Box, handle: ResizeHandle, dx: number, dy: number, fillW: number, fillH: number): Box {
  const share0 = start.w / fillW;
  const across = handle.includes("w") ? -dx / fillW : handle.includes("e") ? dx / fillW : 0;
  const down = handle.includes("n") ? -dy / fillH : handle.includes("s") ? dy / fillH : 0;
  const delta = Math.abs(across) >= Math.abs(down) ? across : down;
  const share = Math.max(MIN_PLACEMENT_SHARE, Math.min(MAX_PLACEMENT_SHARE, share0 + delta));
  const w = share * fillW;
  const h = share * fillH;
  const place = (pos: number, len: number, next: number, low: boolean, high: boolean) =>
    low ? pos + len - next : high ? pos : pos + (len - next) / 2;
  return {
    x: place(start.x, start.w, w, handle.includes("w"), handle.includes("e")),
    y: place(start.y, start.h, h, handle.includes("n"), handle.includes("s")),
    w,
    h,
  };
}

/**
 * The box resized from `handle` by (`dx`, `dy`) inches from where the drag
 * began, under the placement rule. The size is held to 10–300% before the
 * moving edge is placed, so at a limit the opposite edge stays where it was.
 * With `lock`, width and height keep the fill size's shape.
 */
export function resizeBox(
  start: Box,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  slideW: number,
  slideH: number,
  fill?: FillSize | null,
  lock = false,
): Box {
  const fillW = fill?.w ?? slideW;
  const fillH = fill?.h ?? slideH;
  if (lock) return clampBox(lockedResize(start, handle, dx, dy, fillW, fillH), slideW, slideH, fill);
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
export function clampBox(b: Box, slideW: number, slideH: number, fill?: FillSize | null): Box {
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

/** The placement fields' values, in percent: size as a share of the fill size, position of the slide. */
export interface PlacementPercents { x: number; y: number; w: number; h: number }

/**
 * What the placement fields read for `box`: width and height as shares of the
 * fill size (the slide's own while no picture gives one), the top-left corner
 * from the slide's top-left as shares of the slide, negative past its edge.
 * Unrounded: the fields round for display.
 */
export function placementPercents(box: Box, slideW: number, slideH: number, fill?: FillSize | null): PlacementPercents {
  return {
    x: (box.x / slideW) * 100,
    y: (box.y / slideH) * 100,
    w: (box.w / (fill?.w ?? slideW)) * 100,
    h: (box.h / (fill?.h ?? slideH)) * 100,
  };
}

/** A placement field: the one size field (lock on), width, height, or position from the left / top. */
export type PlacementField = "size" | "w" | "h" | "x" | "y";

/** What a placement field is set against: the slide, the fill size, and whether width and height are locked. */
export interface PlacementFrame {
  slideW: number;
  slideH: number;
  fill?: FillSize | null;
  /** Width and height locked to the fill size's shape: one size moves both. */
  lock: boolean;
}

/**
 * The box with one field set to `pct` percent, under the placement rule. A
 * size keeps the top-left corner where the rule lets it; with the lock on,
 * any size field sets width and height to the same share of the fill size.
 */
export function setPlacementField(box: Box, field: PlacementField, pct: number, frame: PlacementFrame): Box {
  const { slideW, slideH, fill, lock } = frame;
  const fillW = fill?.w ?? slideW;
  const fillH = fill?.h ?? slideH;
  const share = pct / 100;
  const b = { ...box };
  if (field === "x") b.x = share * slideW;
  else if (field === "y") b.y = share * slideH;
  else if (lock || field === "size") {
    b.w = share * fillW;
    b.h = share * fillH;
  } else if (field === "w") b.w = share * fillW;
  else b.h = share * fillH;
  return clampBox(b, slideW, slideH, fill);
}

/**
 * The box with its height brought to its width's share of the fill size, as
 * the lock is turned back on; the top-left corner kept where the rule lets it.
 */
export function lockBox(box: Box, slideW: number, slideH: number, fill?: FillSize | null): Box {
  return setPlacementField(box, "size", placementPercents(box, slideW, slideH, fill).w, { slideW, slideH, fill, lock: true });
}

/**
 * The box centred on the slide across (`x`) or down (`y`). A box larger than
 * the slide reaches past both edges equally, so it still covers the slide.
 */
export function centerBox(box: Box, axis: "x" | "y", slideW: number, slideH: number): Box {
  return axis === "x" ? { ...box, x: (slideW - box.w) / 2 } : { ...box, y: (slideH - box.h) / 2 };
}
