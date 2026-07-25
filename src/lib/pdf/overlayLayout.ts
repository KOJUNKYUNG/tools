/**
 * Pure overlay geometry. pdf-lib uses a BOTTOM-LEFT origin with y increasing
 * upward, and `drawImage` places the image's bottom-left corner at (x, y).
 * These helpers compute that corner for the 9 grid anchors and for tiled
 * (repeated) watermarks. Shared by the live preview and the export so they
 * can never drift apart.
 *
 *   GRID (page seen upright):
 *     top-left      top-center      top-right
 *     middle-left   center          middle-right
 *     bottom-left   bottom-center   bottom-right
 */

export const GRID_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
export type GridPosition = (typeof GRID_POSITIONS)[number];

type Horizontal = "left" | "center" | "right";
type Vertical = "top" | "middle" | "bottom";

const GRID_AXES: Record<GridPosition, { h: Horizontal; v: Vertical }> = {
  "top-left": { h: "left", v: "top" },
  "top-center": { h: "center", v: "top" },
  "top-right": { h: "right", v: "top" },
  "middle-left": { h: "left", v: "middle" },
  center: { h: "center", v: "middle" },
  "middle-right": { h: "right", v: "middle" },
  "bottom-left": { h: "left", v: "bottom" },
  "bottom-center": { h: "center", v: "bottom" },
  "bottom-right": { h: "right", v: "bottom" },
};

export interface Point {
  x: number;
  y: number;
}

/**
 * Bottom-left corner where an image of size (contentW × contentH) should be
 * drawn so it lands at the given grid anchor with `margin` inset from the edges.
 */
export function computeAnchor(
  grid: GridPosition,
  pageW: number,
  pageH: number,
  contentW: number,
  contentH: number,
  margin: number,
): Point {
  const { h, v } = GRID_AXES[grid];

  let x: number;
  if (h === "left") x = margin;
  else if (h === "right") x = pageW - contentW - margin;
  else x = (pageW - contentW) / 2;

  let y: number;
  if (v === "bottom") y = margin;
  else if (v === "top") y = pageH - contentH - margin;
  else y = (pageH - contentH) / 2;

  return { x, y };
}

/**
 * Bottom-left corners for a tiled watermark covering the page on a regular
 * grid. Step is tile size + gap on each axis. Always returns at least one tile.
 */
export function computeTilePositions(
  pageW: number,
  pageH: number,
  tileW: number,
  tileH: number,
  gapX: number,
  gapY: number,
): Point[] {
  const stepX = Math.max(1, tileW + gapX);
  const stepY = Math.max(1, tileH + gapY);
  const points: Point[] = [];
  for (let y = 0; y < pageH; y += stepY) {
    for (let x = 0; x < pageW; x += stepX) {
      points.push({ x, y });
    }
  }
  if (points.length === 0) points.push({ x: 0, y: 0 });
  return points;
}

/**
 * Bottom-left corner at which to draw an image of size (w × h) so that, after
 * pdf-lib rotates it by `angleRad` about that corner, the image CENTER lands at
 * (cx, cy). pdf-lib's `rotate` pivots on the draw origin (the bottom-left
 * corner), so to pin the center we subtract the rotated half-extent.
 *
 *   corner = center - R(θ)·(w/2, h/2)
 *   R(θ) = [[cosθ, -sinθ], [sinθ, cosθ]]
 */
export function cornerForCenter(
  cx: number,
  cy: number,
  w: number,
  h: number,
  angleRad: number,
): Point {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const hw = w / 2;
  const hh = h / 2;
  const dx = hw * cos - hh * sin;
  const dy = hw * sin + hh * cos;
  return { x: cx - dx, y: cy - dy };
}

/**
 * Default spacing between tiled watermarks, derived from the tile size with a
 * minimum floor. Gaps scale with HALF the tile size so the vertical step
 * (tileH + gapY) never runs wider than the horizontal step for wide-but-short
 * text boxes — keeping the tiled pattern visually balanced.
 */
export function defaultTileGaps(
  tileW: number,
  tileH: number,
): { gapX: number; gapY: number } {
  return {
    gapX: Math.max(tileW * 0.5, 48),
    gapY: Math.max(tileH * 0.5, 48),
  };
}

/**
 * Center (visual space, bottom-left origin, y-up) at which to place a page
 * number. `position` is normalized top-left (0..1, y-down — canvas-natural);
 * null falls back to the `grid` anchor + margin. Clamped so the box stays on-page.
 */
export function resolveNumberCenter(opts: {
  grid: GridPosition;
  position: { x: number; y: number } | null;
  pageW: number;
  pageH: number;
  boxW: number;
  boxH: number;
  margin: number;
}): Point {
  const { grid, position, pageW, pageH, boxW, boxH, margin } = opts;
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(Math.max(v, lo), Math.min(hi, Math.max(lo, hi)));
  if (position) {
    const cx = position.x * pageW;
    const cy = pageH - position.y * pageH; // flip top-left → bottom-left
    return {
      x: clamp(cx, boxW / 2, pageW - boxW / 2),
      y: clamp(cy, boxH / 2, pageH - boxH / 2),
    };
  }
  const corner = computeAnchor(grid, pageW, pageH, boxW, boxH, margin);
  return { x: corner.x + boxW / 2, y: corner.y + boxH / 2 };
}

/**
 * Page rotation handling (pdf `/Rotate`, clockwise when displayed).
 *
 * pdf-lib's `drawImage` draws in UNROTATED user space (MediaBox coords,
 * bottom-left origin); the viewer then rotates the whole page by `/Rotate`
 * for display. To place an overlay where the user SEES it (and upright), we
 * compute the anchor in the upright "visual" space, then map the point back
 * into user space and add the page rotation to the draw angle.
 */
export type PageRotation = 0 | 90 | 180 | 270;

/** Snap any angle to the nearest 0/90/180/270 (PDF only allows multiples of 90). */
export function normalizeRotation(angle: number): PageRotation {
  const snapped = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return snapped as PageRotation;
}

/** Visual (as-displayed) page dimensions: swapped for 90/270. */
export function visualSize(
  rotation: PageRotation,
  w: number,
  h: number,
): { vw: number; vh: number } {
  return rotation % 180 === 0 ? { vw: w, vh: h } : { vw: h, vh: w };
}

/**
 * Map a point from upright visual coords (bottom-left origin, visual dims) to
 * pdf user-space coords (MediaBox dims w×h). Inverse of the viewer's clockwise
 * `/Rotate`.
 */
export function visualPointToUser(
  rotation: PageRotation,
  w: number,
  h: number,
  vx: number,
  vy: number,
): Point {
  switch (rotation) {
    case 90:
      return { x: w - vy, y: vx };
    case 180:
      return { x: w - vx, y: h - vy };
    case 270:
      return { x: vy, y: h - vx };
    default:
      return { x: vx, y: vy };
  }
}

/** Clamp an opacity value into pdf-lib's accepted [0, 1] range. */
export function clampOpacity(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Degrees → radians (pdf-lib `degrees()` takes degrees, but math helpers use rad). */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
