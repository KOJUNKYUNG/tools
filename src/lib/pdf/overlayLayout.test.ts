import { describe, it, expect } from "vitest";
import {
  computeAnchor,
  computeTilePositions,
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
