import type { CropRect, ImageDims } from "./maxFitCrop";

export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const HANDLES: ReadonlySet<ResizeHandle> = new Set([
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
]);

interface Point {
  x: number;
  y: number;
}

/**
 * Compute the rect produced by dragging `handle` to `mouse` while preserving
 * the given aspect ratio (`ratio` = w / h), clamped inside `bounds`.
 *
 * Corner handles anchor the opposite corner.
 * Edge handles anchor the opposite edge's midpoint and centre the rect along
 * the perpendicular axis.
 *
 * Returns `prev` unchanged when given an unknown handle string.
 */
export function aspectLockedResize(
  handle: ResizeHandle,
  prev: CropRect,
  mouse: Point,
  ratio: number,
  bounds: ImageDims,
): CropRect {
  if (!HANDLES.has(handle)) return prev;
  if (ratio <= 0 || bounds.w <= 0 || bounds.h <= 0) return prev;

  const px = clamp(mouse.x, 0, bounds.w);
  const py = clamp(mouse.y, 0, bounds.h);

  // Corner handles: anchor = opposite corner.
  if (handle === "se" || handle === "ne" || handle === "sw" || handle === "nw") {
    const anchorX = handle.endsWith("e") ? prev.x : prev.x + prev.width;
    const anchorY = handle.startsWith("s") ? prev.y : prev.y + prev.height;

    const dx = Math.abs(px - anchorX);
    const dy = Math.abs(py - anchorY);
    // Max width given current direction = distance to bound along x.
    const maxW = handle.endsWith("e") ? bounds.w - anchorX : anchorX;
    const maxH = handle.startsWith("s") ? bounds.h - anchorY : anchorY;

    // Honour ratio: pick the limiting dimension among (dx, dy, maxW, maxH/ratio inversions).
    const wFromMouse = Math.min(dx, maxW);
    const hFromMouse = Math.min(dy, maxH);
    let w = Math.min(wFromMouse, hFromMouse * ratio);
    let h = Math.min(hFromMouse, wFromMouse / ratio);
    // The shorter of the two ratio-derived candidates wins:
    if (w / ratio < h) h = w / ratio;
    else w = h * ratio;

    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));

    const x = handle.endsWith("e") ? anchorX : anchorX - w;
    const y = handle.startsWith("s") ? anchorY : anchorY - h;
    return { x, y, width: w, height: h };
  }

  // Edge handles: anchor = opposite edge midpoint; perpendicular axis recentres.
  if (handle === "e" || handle === "w") {
    const anchorX = handle === "e" ? prev.x : prev.x + prev.width;
    const centreY = prev.y + prev.height / 2;
    const maxW = handle === "e" ? bounds.w - anchorX : anchorX;
    let w = Math.min(Math.abs(px - anchorX), maxW);
    let h = w / ratio;

    // If centring h would push past top or bottom, clamp h and recompute w.
    if (centreY - h / 2 < 0) h = centreY * 2;
    if (centreY + h / 2 > bounds.h) h = (bounds.h - centreY) * 2;
    w = Math.min(w, h * ratio);

    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));

    const x = handle === "e" ? anchorX : anchorX - w;
    const y = Math.round(centreY - h / 2);
    return { x, y, width: w, height: h };
  }

  // handle === "n" || handle === "s"
  const anchorY = handle === "s" ? prev.y : prev.y + prev.height;
  const centreX = prev.x + prev.width / 2;
  const maxH = handle === "s" ? bounds.h - anchorY : anchorY;
  let h = Math.min(Math.abs(py - anchorY), maxH);
  let w = h * ratio;

  if (centreX - w / 2 < 0) w = centreX * 2;
  if (centreX + w / 2 > bounds.w) w = (bounds.w - centreX) * 2;
  h = Math.min(h, w / ratio);

  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));

  const y = handle === "s" ? anchorY : anchorY - h;
  const x = Math.round(centreX - w / 2);
  return { x, y, width: w, height: h };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
