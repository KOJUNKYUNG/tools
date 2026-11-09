import { describe, it, expect } from "vitest";
import { clampBox, computeSlidePlacement, cutAtSlide, resizeBox, slidesWithPictureOff } from "./slidePlacement";

describe("slidesWithPictureOff", () => {
  // A 300% frame of a 4:3 picture, flush with a 4:3 slide's right edge.
  const FRAME = { x: -20, y: 0, w: 30, h: 22.5 };
  const PICTURES = [
    { width: 4000, height: 3000 }, // fills the frame: cut, shows
    { width: 3000, height: 4000 }, // narrower, at the frame's left: wholly off the slide
    { width: 4000, height: 1000 }, // as wide as the frame: cut, shows
    { width: 1000, height: 4000 }, // narrower still: wholly off
  ];

  it("names the slides (from 1) whose picture lies wholly off the slide", () => {
    expect(slidesWithPictureOff(FRAME, "top-left", 10, 7.5, PICTURES)).toEqual([2, 4]);
  });

  it("follows the frame's alignment: centred, other pictures fall off instead", () => {
    // Across, at x = -20 + (30 − w) / 2: 3:4 (w 16.875) ends at 3.44 in, on the slide; 1:4 (w 5.625) at −2.19 in.
    // Down, the 4:1 picture (h 7.5) starts at y = (22.5 − 7.5) / 2 = 7.5 in, the slide's bottom edge.
    expect(slidesWithPictureOff(FRAME, "center", 10, 7.5, PICTURES)).toEqual([3, 4]);
  });

  it("finds none for a frame within the slide", () => {
    expect(slidesWithPictureOff({ x: 1, y: 1, w: 5, h: 4 }, "top-left", 10, 7.5, PICTURES)).toEqual([]);
  });
});

describe("cutAtSlide", () => {
  // A 4:3 slide, 10 × 7.5 in.
  it("leaves a picture within the slide whole", () => {
    expect(cutAtSlide({ x: 0, y: 0, w: 10, h: 7.5 }, 10, 7.5, { width: 4000, height: 3000 })).toEqual({ kind: "whole" });
    expect(cutAtSlide({ x: 1, y: 2, w: 4, h: 3 }, 10, 7.5, { width: 400, height: 300 })).toEqual({ kind: "whole" });
  });

  it("cuts a picture enlarged past every edge to the part on the slide", () => {
    // A 4000 × 3000 picture at 150%, centred: a quarter of the extra on each side.
    const cut = cutAtSlide({ x: -2.5, y: -1.875, w: 15, h: 11.25 }, 10, 7.5, { width: 4000, height: 3000 });
    expect(cut).toEqual({
      kind: "cut",
      rect: { x: 0, y: 0, w: 10, h: 7.5 },
      crop: { x: 667, y: 500, width: 2666, height: 2000 },
    });
  });

  it("cuts a picture past one edge on that side only", () => {
    const cut = cutAtSlide({ x: 8, y: 0, w: 4, h: 3 }, 10, 7.5, { width: 400, height: 300 });
    expect(cut).toEqual({ kind: "cut", rect: { x: 8, y: 0, w: 2, h: 3 }, crop: { x: 0, y: 0, width: 200, height: 300 } });
  });

  it("cuts a picture of another shape than the box by its own fitted rectangle", () => {
    // A 3:4 picture in a 150% box of a 4:3 one, centred: as tall as the box, so cut top and bottom only.
    const placed = computeSlidePlacement({ x: -2.5, y: -1.875, w: 15, h: 11.25 }, 3000, 4000, "center");
    expect(cutAtSlide(placed, 10, 7.5, { width: 3000, height: 4000 })).toEqual({
      kind: "cut",
      rect: { x: 0.78125, y: 0, w: 8.4375, h: 7.5 },
      crop: { x: 0, y: 667, width: 3000, height: 2666 },
    });
  });

  it("finds nothing to show of a picture lying wholly off the slide", () => {
    expect(cutAtSlide({ x: -6, y: 0, w: 5, h: 7.5 }, 10, 7.5, { width: 500, height: 750 })).toEqual({ kind: "hidden" });
  });
});

describe("clampBox (CONTEXT Placement)", () => {
  // A 16:9 slide; the first picture is 3:4, so its fill size is 5.625 × 7.5.
  const SW = 13.333;
  const SH = 7.5;
  const FILL = { w: 5.625, h: 7.5 };

  it("caps the size at 300% of the fill size", () => {
    const b = clampBox({ x: -5, y: -5, w: 30, h: 30 }, SW, SH, FILL);
    expect(b.w).toBeCloseTo(16.875, 6);
    expect(b.h).toBeCloseTo(22.5, 6);
  });

  it("keeps the size at least 10% of the fill size", () => {
    const b = clampBox({ x: 1, y: 1, w: 0.01, h: 0.01 }, SW, SH, FILL);
    expect(b.w).toBeCloseTo(0.5625, 6);
    expect(b.h).toBeCloseTo(0.75, 6);
  });

  it("lets a size past the slide stand, up to 300%", () => {
    const b = clampBox({ x: -1, y: -1, w: 15, h: 20 }, SW, SH, FILL);
    expect(b).toMatchObject({ w: 15, h: 20 });
  });

  it("on an axis where the box is larger than the slide, makes it cover the slide", () => {
    // Pushed right, the box would leave a gap at the left: it comes back to x = 0.
    expect(clampBox({ x: 2, y: 0, w: 15, h: 7.5 }, SW, SH, FILL).x).toBe(0);
    // Pushed left, it would leave a gap at the right: it stops where its right edge meets the slide's.
    expect(clampBox({ x: -5, y: 0, w: 15, h: 7.5 }, SW, SH, FILL).x).toBeCloseTo(13.333 - 15, 6);
    // Anywhere between covers the slide and stays where it was put.
    expect(clampBox({ x: -1, y: 0, w: 15, h: 7.5 }, SW, SH, FILL).x).toBe(-1);
  });

  it("on an axis where the box is smaller than the slide, keeps it inside", () => {
    expect(clampBox({ x: -1, y: 0, w: 5, h: 7.5 }, SW, SH, FILL).x).toBe(0);
    expect(clampBox({ x: 12, y: 0, w: 5, h: 7.5 }, SW, SH, FILL).x).toBeCloseTo(8.333, 6);
  });

  it("treats each axis on its own: covering across, inside down", () => {
    // 200% of a 16:9 fill: wider than the slide, and here shorter than it.
    const fill = { w: 13.333, h: 7.5 };
    const b = clampBox({ x: 1, y: -1, w: 20, h: 5 }, SW, SH, fill);
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
    const c = clampBox({ x: -10, y: 4, w: 20, h: 5 }, SW, SH, fill);
    expect(c.x).toBeCloseTo(13.333 - 20, 6);
    expect(c.y).toBeCloseTo(2.5, 6);
  });

  it("resizing from the left edge past 300% stops there, its right edge staying put", () => {
    // Right edge at 13.333; dragged 10 in further left than 300% allows.
    const b = resizeBox({ x: -3.542, y: 0, w: 16.875, h: 7.5 }, "w", -10, 0, SW, SH, FILL);
    expect(b.w).toBeCloseTo(16.875, 6);
    expect(b.x + b.w).toBeCloseTo(13.333, 6);
  });

  it("resizing from the top edge under 10% stops there, its bottom edge staying put", () => {
    const b = resizeBox({ x: 0, y: 1, w: 5.625, h: 6 }, "n", 0, 10, SW, SH, FILL);
    expect(b.h).toBeCloseTo(0.75, 6);
    expect(b.y + b.h).toBeCloseTo(7, 6);
  });

  it("resizing from the bottom-right corner grows the box, then the rule applies", () => {
    const b = resizeBox({ x: 0, y: 0, w: 5.625, h: 7.5 }, "se", 2, 1, SW, SH, FILL);
    expect(b).toEqual({ x: 0, y: 0, w: 7.625, h: 8.5 });
  });

  it("measures from the slide when no picture gives a fill size", () => {
    const b = clampBox({ x: 0, y: 0, w: 100, h: 100 }, 10, 7.5);
    expect(b).toMatchObject({ w: 30, h: 22.5 });
  });
});

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
