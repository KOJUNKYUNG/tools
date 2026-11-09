import { describe, it, expect } from "vitest";
import {
  centerBox,
  clampBox,
  computeSlidePlacement,
  cutAtSlide,
  lockBox,
  placementPercents,
  resizeBox,
  setPlacementField,
  slidesWithPictureOff,
} from "./slidePlacement";

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

  // 5% of the slide must stay covered: 0.667 in across, 0.375 in down.
  it("lets a box smaller than the slide reach past its edges, 5% of the slide still covered", () => {
    expect(clampBox({ x: -1, y: 0, w: 5, h: 7.5 }, SW, SH, FILL).x).toBe(-1);
    // Pushed further left, its right edge stops 5% of the slide inside the left edge.
    expect(clampBox({ x: -10, y: 0, w: 5, h: 7.5 }, SW, SH, FILL).x).toBeCloseTo(0.66665 - 5, 6);
    // Pushed right, its left edge stops 5% of the slide inside the right edge.
    expect(clampBox({ x: 20, y: 0, w: 5, h: 7.5 }, SW, SH, FILL).x).toBeCloseTo(13.333 - 0.66665, 6);
  });

  it("lets a box larger than the slide leave a gap, 5% of the slide still covered", () => {
    expect(clampBox({ x: 2, y: 0, w: 15, h: 7.5 }, SW, SH, FILL).x).toBe(2);
    expect(clampBox({ x: -20, y: 0, w: 15, h: 7.5 }, SW, SH, FILL).x).toBeCloseTo(0.66665 - 15, 6);
  });

  it("keeps a box narrower than 5% of the slide wholly on it", () => {
    // 10% of the fill size: 0.5625 in, under 0.667 in.
    expect(clampBox({ x: -1, y: 0, w: 0.5625, h: 0.75 }, SW, SH, FILL).x).toBe(0);
    expect(clampBox({ x: 20, y: 0, w: 0.5625, h: 0.75 }, SW, SH, FILL).x).toBeCloseTo(13.333 - 0.5625, 6);
  });

  it("treats each axis on its own", () => {
    const b = clampBox({ x: -30, y: -10, w: 20, h: 5 }, SW, SH, { w: 13.333, h: 7.5 });
    expect(b.x).toBeCloseTo(0.66665 - 20, 6);
    expect(b.y).toBeCloseTo(0.375 - 5, 6);
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

describe("placement fields (percent ↔ inches)", () => {
  // A 16:9 slide; the first picture is 3:4, so its fill size is 5.625 × 7.5.
  const SW = 13.333;
  const SH = 7.5;
  const FILL = { w: 5.625, h: 7.5 };
  const at = (lock: boolean) => ({ slideW: SW, slideH: SH, fill: FILL, lock });

  it("reads size as a share of the fill size and position as a share of the slide, negative past its edge", () => {
    const p = placementPercents({ x: -3.542, y: -15, w: 16.875, h: 22.5 }, SW, SH, FILL);
    expect(p.w).toBeCloseTo(300, 6);
    expect(p.h).toBeCloseTo(300, 6);
    expect(p.x).toBeCloseTo(-26.566, 2);
    expect(p.y).toBeCloseTo(-200, 6);
  });

  it("with the lock on, a size sets width and height together, the top-left corner kept", () => {
    const b = setPlacementField({ x: 1, y: 0.5, w: 2.8125, h: 3.75 }, "size", 80, at(true));
    expect(b.x).toBe(1);
    expect(b.y).toBe(0.5);
    expect(b.w).toBeCloseTo(4.5, 6);
    expect(b.h).toBeCloseTo(6, 6);
  });

  it("with the lock on, 300% is the largest, the top-left corner kept", () => {
    const b = setPlacementField({ x: 1, y: 0.5, w: 5.625, h: 7.5 }, "size", 400, at(true));
    expect(b.w).toBeCloseTo(16.875, 6); // 300% of 5.625
    expect(b.h).toBeCloseTo(22.5, 6);
    expect(b.x).toBe(1);
    expect(b.y).toBe(0.5);
  });

  it("with the lock on, typing a width or a height moves both", () => {
    const b = setPlacementField({ x: 0, y: 0, w: 5.625, h: 7.5 }, "h", 50, at(true));
    expect(b.w).toBeCloseTo(2.8125, 6);
    expect(b.h).toBeCloseTo(3.75, 6);
  });

  it("with the lock off, a width leaves the height as it was", () => {
    const b = setPlacementField({ x: 0, y: 0, w: 5.625, h: 7.5 }, "w", 150, at(false));
    expect(b.w).toBeCloseTo(8.4375, 6);
    expect(b.h).toBe(7.5);
  });

  it("with the lock off, a height leaves the width as it was", () => {
    const b = setPlacementField({ x: 0, y: 0, w: 5.625, h: 7.5 }, "h", 40, at(false));
    expect(b.w).toBe(5.625);
    expect(b.h).toBeCloseTo(3, 6);
  });

  it("with the lock off, 300% wide leaves the height and the top-left corner as they were", () => {
    const b = setPlacementField({ x: 2, y: 1, w: 5.625, h: 3.75 }, "w", 300, at(false));
    expect(b.w).toBeCloseTo(16.875, 6);
    expect(b.x).toBe(2);
    expect(b.h).toBe(3.75);
    expect(b.y).toBe(1);
    expect(placementPercents(b, SW, SH, FILL)).toMatchObject({ w: 300, h: 50 });
  });

  it("a negative position places a box past the slide's left edge, as far as 5% of the slide stays covered", () => {
    // 300% wide (16.875 in) on a 13.333 in slide: x may run down to 0.667 − 16.875 in.
    const big = { x: 0, y: 0, w: 16.875, h: 22.5 };
    expect(setPlacementField(big, "x", -50, at(true)).x).toBeCloseTo(-6.6665, 4);
    expect(setPlacementField(big, "x", -200, at(true)).x).toBeCloseTo(0.66665 - 16.875, 6);
    expect(setPlacementField(big, "y", -100, at(true)).y).toBeCloseTo(-7.5, 6);
  });

  it("a negative position places a box at 100% past the slide's edge too", () => {
    expect(setPlacementField({ x: 2, y: 0, w: 5.625, h: 7.5 }, "x", -10, at(false)).x).toBeCloseTo(-1.3333, 4);
    expect(setPlacementField({ x: 2, y: 0, w: 5.625, h: 7.5 }, "y", 90, at(false)).y).toBeCloseTo(6.75, 6);
  });

  it("a typed position round-trips through the fields", () => {
    const b = setPlacementField({ x: 0, y: 0, w: 16.875, h: 22.5 }, "y", -150, at(true));
    expect(placementPercents(b, SW, SH, FILL).y).toBeCloseTo(-150, 6);
  });
});

describe("lockBox, centerBox and a locked resize", () => {
  const SW = 13.333;
  const SH = 7.5;
  const FILL = { w: 5.625, h: 7.5 };

  it("locking again brings the height to the width's share, the top-left corner kept", () => {
    // Width 200%, height 50% of the fill size.
    const b = lockBox({ x: 1, y: 1, w: 11.25, h: 3.75 }, SW, SH, FILL);
    expect(b.w).toBeCloseTo(11.25, 6);
    expect(b.h).toBeCloseTo(15, 6); // 200% of 7.5
    expect(b.x).toBe(1);
    expect(b.y).toBe(1);
  });

  it("centres an enlarged box across: an equal part past each edge", () => {
    const b = centerBox({ x: 0, y: 0, w: 16.875, h: 22.5 }, "x", SW, SH);
    expect(b.x).toBeCloseTo((13.333 - 16.875) / 2, 6);
    expect(b.y).toBe(0);
  });

  it("centres an enlarged box down: an equal part past the top and the bottom", () => {
    const b = centerBox({ x: 0, y: 0, w: 16.875, h: 22.5 }, "y", SW, SH);
    expect(b.y).toBeCloseTo(-7.5, 6);
    expect(b.x).toBe(0);
  });

  it("centres a box smaller than the slide inside it", () => {
    expect(centerBox({ x: 0, y: 0, w: 5.625, h: 7.5 }, "x", SW, SH).x).toBeCloseTo(3.854, 3);
  });

  it("with the lock on, a corner drag keeps the picture's shape, the opposite corner staying put", () => {
    // From 100% at the slide's right edge, the bottom-left corner dragged 1.125 in left: 120%.
    const b = resizeBox({ x: 7.708, y: 0, w: 5.625, h: 7.5 }, "sw", -1.125, 0, SW, SH, FILL, true);
    expect(b.w).toBeCloseTo(6.75, 6);
    expect(b.h).toBeCloseTo(9, 6);
    expect(b.x + b.w).toBeCloseTo(13.333, 6);
    expect(b.y).toBe(0); // the top edge, opposite the handle, stays put
  });

  it("with the lock on, an edge drag grows both sides, the box's centre kept on the other axis", () => {
    // The right edge dragged 2.8125 in: 150%. Its height grows around its middle.
    const b = resizeBox({ x: 1, y: 0, w: 5.625, h: 7.5 }, "e", 2.8125, 0, SW, SH, FILL, true);
    expect(b.x).toBe(1);
    expect(b.w).toBeCloseTo(8.4375, 6);
    expect(b.h).toBeCloseTo(11.25, 6);
    expect(b.y).toBeCloseTo(-1.875, 6);
  });

  it("with the lock on, a corner drag stops at 300%", () => {
    const b = resizeBox({ x: 0, y: 0, w: 5.625, h: 7.5 }, "se", 50, 50, SW, SH, FILL, true);
    expect(b.w).toBeCloseTo(16.875, 6);
    expect(b.h).toBeCloseTo(22.5, 6);
  });
});
