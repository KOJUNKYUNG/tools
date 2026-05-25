import { describe, expect, it } from "vitest";
import { computeImageFit } from "./imageFit";

const A4 = { w: 595, h: 842 };

describe("computeImageFit", () => {
  it("centers a landscape image in portrait A4 (no rotation), scaling to width", () => {
    const f = computeImageFit(1000, 500, A4.w, A4.h, 0);
    expect(f.drawW).toBeCloseTo(595, 3);
    expect(f.drawH).toBeCloseTo(297.5, 3);
    expect(f.x).toBeCloseTo(0, 3);
    expect(f.y).toBeCloseTo(272.25, 3);
    expect(f.rotateDeg).toBe(0);
  });

  it("centers a portrait image in portrait A4, scaling to height", () => {
    const f = computeImageFit(500, 1000, A4.w, A4.h, 0);
    expect(f.drawW).toBeCloseTo(421, 3);
    expect(f.drawH).toBeCloseTo(842, 3);
    expect(f.x).toBeCloseTo(87, 3);
    expect(f.y).toBeCloseTo(0, 3);
  });

  it("upscales a small image to fill the page (aspect preserved)", () => {
    const f = computeImageFit(100, 100, A4.w, A4.h, 0);
    expect(f.drawW).toBeCloseTo(595, 3);
    expect(f.drawH).toBeCloseTo(595, 3);
    expect(f.x).toBeCloseTo(0, 3);
    expect(f.y).toBeCloseTo(123.5, 3);
  });

  it("swaps effective dimensions for 90° rotation and emits ccw rotateDeg", () => {
    const f = computeImageFit(1000, 500, A4.w, A4.h, 90);
    // rotated bounding box (drawH × drawW) must fit the page
    expect(f.drawW).toBeCloseTo(842, 3);
    expect(f.drawH).toBeCloseTo(421, 3);
    expect(f.rotateDeg).toBe(270); // clockwise 90 → counterclockwise 270
  });

  it("maps clockwise rotation to counterclockwise pdf-lib degrees", () => {
    expect(computeImageFit(10, 10, 100, 100, 0).rotateDeg).toBe(0);
    expect(computeImageFit(10, 10, 100, 100, 90).rotateDeg).toBe(270);
    expect(computeImageFit(10, 10, 100, 100, 180).rotateDeg).toBe(180);
    expect(computeImageFit(10, 10, 100, 100, 270).rotateDeg).toBe(90);
  });
});
