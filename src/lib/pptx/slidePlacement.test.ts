import { describe, it, expect } from "vitest";
import { computeSlidePlacement } from "./slidePlacement";
describe("computeSlidePlacement", () => {
  it("image wider than box → width-limited, letterbox below, top-left anchored", () => {
    const r = computeSlidePlacement({ x: 0, y: 0, w: 4, h: 3 }, 200, 100);
    expect(r).toEqual({ x: 0, y: 0, w: 4, h: 2 });
  });
  it("image taller than box → height-limited, anchored at box top-left", () => {
    const r = computeSlidePlacement({ x: 1, y: 1, w: 4, h: 4 }, 100, 200);
    expect(r).toEqual({ x: 1, y: 1, w: 2, h: 4 });
  });
  it("equal aspect → fills the box exactly", () => {
    const r = computeSlidePlacement({ x: 0, y: 0, w: 4, h: 2 }, 200, 100);
    expect(r).toEqual({ x: 0, y: 0, w: 4, h: 2 });
  });
  it("degenerate image dimensions → zero-size rect at box top-left", () => {
    const r = computeSlidePlacement({ x: 2, y: 1, w: 4, h: 3 }, 0, 100);
    expect(r).toEqual({ x: 2, y: 1, w: 0, h: 0 });
  });
  it("degenerate box → zero-size rect at box top-left", () => {
    const r = computeSlidePlacement({ x: 1, y: 1, w: 0, h: 3 }, 200, 100);
    expect(r).toEqual({ x: 1, y: 1, w: 0, h: 0 });
  });
  it("center align: image wider than box centers vertically within the box", () => {
    // box 4x4 at (0,0), img 200x100 (aspect 2) → width-limited: w=4,h=2; centered y = 0 + (4-2)/2 = 1
    const r = computeSlidePlacement({ x: 0, y: 0, w: 4, h: 4 }, 200, 100, "center");
    expect(r).toEqual({ x: 0, y: 1, w: 4, h: 2 });
  });
  it("center align: image taller than box centers horizontally", () => {
    // box 4x4 at (0,0), img 100x200 (aspect .5) → height-limited: h=4,w=2; centered x = (4-2)/2 = 1
    const r = computeSlidePlacement({ x: 0, y: 0, w: 4, h: 4 }, 100, 200, "center");
    expect(r).toEqual({ x: 1, y: 0, w: 2, h: 4 });
  });
  it("top-left is the default (no align arg)", () => {
    const r = computeSlidePlacement({ x: 0, y: 0, w: 4, h: 4 }, 200, 100);
    expect(r).toEqual({ x: 0, y: 0, w: 4, h: 2 });
  });
});
