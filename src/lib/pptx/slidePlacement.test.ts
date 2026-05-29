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
});
