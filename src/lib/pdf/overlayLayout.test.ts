import { describe, it, expect } from "vitest";
import {
  computeAnchor,
  computeTilePositions,
  cornerForCenter,
  defaultTileGaps,
  visualSize,
  visualPointToUser,
  normalizeRotation,
  clampOpacity,
  degToRad,
  GRID_POSITIONS,
} from "./overlayLayout";

const page = { w: 200, h: 100 };
const box = { w: 40, h: 10 };
const m = 5;

describe("computeAnchor (pdf-lib bottom-left origin)", () => {
  it("bottom-left sits at the margin", () => {
    expect(computeAnchor("bottom-left", page.w, page.h, box.w, box.h, m)).toEqual({ x: 5, y: 5 });
  });
  it("top-right accounts for box size + margin", () => {
    // x = 200 - 40 - 5 = 155 ; y = 100 - 10 - 5 = 85
    expect(computeAnchor("top-right", page.w, page.h, box.w, box.h, m)).toEqual({ x: 155, y: 85 });
  });
  it("top-left margins x, accounts for box height in y", () => {
    expect(computeAnchor("top-left", page.w, page.h, box.w, box.h, m)).toEqual({ x: 5, y: 85 });
  });
  it("bottom-right accounts for box width in x", () => {
    expect(computeAnchor("bottom-right", page.w, page.h, box.w, box.h, m)).toEqual({ x: 155, y: 5 });
  });
  it("center is the geometric center of the box", () => {
    // x = (200-40)/2 = 80 ; y = (100-10)/2 = 45
    expect(computeAnchor("center", page.w, page.h, box.w, box.h, m)).toEqual({ x: 80, y: 45 });
  });
  it("bottom-center centers x, margins y", () => {
    expect(computeAnchor("bottom-center", page.w, page.h, box.w, box.h, m)).toEqual({ x: 80, y: 5 });
  });
  it("top-center centers x, accounts for box height in y", () => {
    expect(computeAnchor("top-center", page.w, page.h, box.w, box.h, m)).toEqual({ x: 80, y: 85 });
  });
  it("middle-left margins x, centers y", () => {
    expect(computeAnchor("middle-left", page.w, page.h, box.w, box.h, m)).toEqual({ x: 5, y: 45 });
  });
  it("middle-right accounts for box width in x, centers y", () => {
    expect(computeAnchor("middle-right", page.w, page.h, box.w, box.h, m)).toEqual({ x: 155, y: 45 });
  });
  it("exposes all 9 grid positions", () => {
    expect(GRID_POSITIONS).toHaveLength(9);
  });
});

describe("computeTilePositions", () => {
  it("covers the page on a regular grid with non-negative coords", () => {
    const pts = computeTilePositions(200, 100, 40, 10, 60, 40);
    expect(pts.length).toBeGreaterThan(1);
    expect(pts.every((p) => p.x >= 0 && p.y >= 0)).toBe(true);
  });
  it("returns at least one tile even when the tile is larger than the page", () => {
    expect(computeTilePositions(50, 50, 200, 200, 10, 10).length).toBeGreaterThanOrEqual(1);
  });
  it("steps by tile size + gap", () => {
    // step x = 40+60=100 → x at 0,100 ; step y = 10+40=50 → y at 0,50
    const pts = computeTilePositions(200, 100, 40, 10, 60, 40);
    const xs = [...new Set(pts.map((p) => p.x))].sort((a, b) => a - b);
    const ys = [...new Set(pts.map((p) => p.y))].sort((a, b) => a - b);
    expect(xs).toEqual([0, 100]);
    expect(ys).toEqual([0, 50]);
  });
});

describe("cornerForCenter (rotate about the image center)", () => {
  it("at angle 0 the corner is center minus half-extent", () => {
    expect(cornerForCenter(100, 50, 40, 20, 0)).toEqual({ x: 80, y: 40 });
  });
  it("keeps the center fixed under 90° rotation", () => {
    const c = cornerForCenter(100, 50, 40, 20, degToRad(90));
    // dx = (20*0) - (10*1) = -10 ; dy = (20*1) + (10*0) = 20
    expect(c.x).toBeCloseTo(110);
    expect(c.y).toBeCloseTo(30);
  });
  it("at 180° the corner flips to the opposite side", () => {
    const c = cornerForCenter(100, 50, 40, 20, degToRad(180));
    expect(c.x).toBeCloseTo(120);
    expect(c.y).toBeCloseTo(60);
  });
});

describe("defaultTileGaps", () => {
  it("derives gaps from the tile size with sensible floors", () => {
    // big tile → proportional gaps
    expect(defaultTileGaps(200, 100)).toEqual({ gapX: 100, gapY: 50 });
  });
  it("keeps the vertical step from running wider than the horizontal step", () => {
    // step = size + gap. For a wide-but-short text box, vertical step must not
    // exceed horizontal step (issue: tile rows too far apart).
    const w = 160;
    const h = 60;
    const { gapX, gapY } = defaultTileGaps(w, h);
    expect(w + gapX).toBeGreaterThanOrEqual(h + gapY);
  });
  it("applies minimum floors for tiny tiles", () => {
    expect(defaultTileGaps(10, 10)).toEqual({ gapX: 48, gapY: 48 });
  });
});

describe("normalizeRotation", () => {
  it("snaps to 0/90/180/270 and wraps negatives", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(44)).toBe(0);
    expect(normalizeRotation(46)).toBe(90);
  });
});

describe("visualSize", () => {
  it("keeps dims for 0/180, swaps for 90/270", () => {
    expect(visualSize(0, 200, 100)).toEqual({ vw: 200, vh: 100 });
    expect(visualSize(180, 200, 100)).toEqual({ vw: 200, vh: 100 });
    expect(visualSize(90, 200, 100)).toEqual({ vw: 100, vh: 200 });
    expect(visualSize(270, 200, 100)).toEqual({ vw: 100, vh: 200 });
  });
});

describe("visualPointToUser (upright-view point → pdf user space)", () => {
  const W = 200;
  const H = 100;
  it("is identity at rotation 0", () => {
    expect(visualPointToUser(0, W, H, 30, 40)).toEqual({ x: 30, y: 40 });
  });
  it("maps the visual bottom-left to the right user-space corner for 90", () => {
    // forward 90: user(200,0) → visual(0,0); so inverse visual(0,0) → user(200,0)
    expect(visualPointToUser(90, W, H, 0, 0)).toEqual({ x: 200, y: 0 });
    expect(visualPointToUser(90, W, H, 50, 100)).toEqual({ x: 100, y: 50 });
  });
  it("maps correctly for 180", () => {
    expect(visualPointToUser(180, W, H, 0, 0)).toEqual({ x: 200, y: 100 });
    expect(visualPointToUser(180, W, H, 30, 40)).toEqual({ x: 170, y: 60 });
  });
  it("maps correctly for 270", () => {
    // forward 270: user(0,0) → visual(H,0)=(100,0); inverse visual(100,0) → user(0,0)
    expect(visualPointToUser(270, W, H, 100, 0)).toEqual({ x: 0, y: 0 });
    expect(visualPointToUser(270, W, H, 0, 0)).toEqual({ x: 0, y: 100 });
  });
  it("round-trips visual→user→visual through the forward 90 map", () => {
    // forward 90: Vx=Uy, Vy=W-Ux
    const u = visualPointToUser(90, W, H, 70, 120);
    const vBack = { x: u.y, y: W - u.x };
    expect(vBack).toEqual({ x: 70, y: 120 });
  });
});

describe("helpers", () => {
  it("clampOpacity bounds to [0,1]", () => {
    expect(clampOpacity(-1)).toBe(0);
    expect(clampOpacity(2)).toBe(1);
    expect(clampOpacity(0.5)).toBe(0.5);
  });
  it("degToRad converts", () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI);
    expect(degToRad(0)).toBe(0);
  });
});
