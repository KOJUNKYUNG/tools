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

/** Clamp an opacity value into pdf-lib's accepted [0, 1] range. */
export function clampOpacity(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Degrees → radians (pdf-lib `degrees()` takes degrees, but math helpers use rad). */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
