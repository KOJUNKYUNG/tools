import { describe, expect, it } from "vitest";
import {
  aspectLockedResize,
  type ResizeHandle,
} from "./aspectLockedResize";

const bounds = { w: 1000, h: 1000 };
const baseRect = { x: 200, y: 200, width: 400, height: 200 }; // ratio 2:1

describe("aspectLockedResize", () => {
  describe("corner handle 'se' (south-east)", () => {
    const handle: ResizeHandle = "se";

    it("grows the rect when the pointer moves down-right, preserving 2:1 ratio", () => {
      const next = aspectLockedResize(handle, baseRect, { x: 800, y: 500 }, 2, bounds);
      // anchor = nw = (200, 200). Pointer at (800, 500) → desired w=600, h=300.
      // ratio 2:1 honored: cap min(600/2, 300/1) = 300 → w=600, h=300
      expect(next).toEqual({ x: 200, y: 200, width: 600, height: 300 });
    });

    it("clamps when pointer would push the rect past image bounds", () => {
      const next = aspectLockedResize(handle, baseRect, { x: 9999, y: 9999 }, 2, bounds);
      // anchor (200, 200). Max width along x = 800, max height along y = 800.
      // ratio 2:1: pick the limiting dimension. 800 width → 400 height ✓.
      // 800 height → 1600 width ✗ exceeds 800 width.
      // → 800×400.
      expect(next).toEqual({ x: 200, y: 200, width: 800, height: 400 });
    });

    it("never shrinks below 1px", () => {
      const next = aspectLockedResize(handle, baseRect, { x: 200, y: 200 }, 2, bounds);
      expect(next.width).toBeGreaterThanOrEqual(1);
      expect(next.height).toBeGreaterThanOrEqual(1);
    });
  });

  describe("corner handle 'nw' (north-west)", () => {
    it("anchors south-east corner when dragging top-left", () => {
      const next = aspectLockedResize("nw", baseRect, { x: 100, y: 250 }, 2, bounds);
      // anchor = se = (600, 400). Pointer at (100, 250) → desired w=500, h=150.
      // ratio 2:1: cap min(500/2, 150/1) = 150 → w=300, h=150.
      // new rect ends at (600,400), so x = 600-300=300, y = 400-150=250.
      expect(next).toEqual({ x: 300, y: 250, width: 300, height: 150 });
    });
  });

  describe("edge handle 'e' (east)", () => {
    it("changes width and adjusts height to preserve ratio, centred vertically", () => {
      const next = aspectLockedResize("e", baseRect, { x: 800, y: 0 }, 2, bounds);
      // anchor = west edge midpoint (200, 300). Desired width = 600.
      // height = 600/2 = 300. y centred → 300 - 150 = 150.
      expect(next).toEqual({ x: 200, y: 150, width: 600, height: 300 });
    });

    it("clamps height when centring would push past top/bottom", () => {
      // baseRect centre y = 300. If asking for very tall rect, top would go negative.
      const next = aspectLockedResize("e", baseRect, { x: 9999, y: 0 }, 2, bounds);
      // pointer x=9999 → desired width = 9999-200 = clamp at right edge first.
      // Max width along x = 800. height = 400. centre y = 300 → y = 100.
      expect(next).toEqual({ x: 200, y: 100, width: 800, height: 400 });
    });
  });

  describe("edge handle 'n' (north)", () => {
    it("changes height and adjusts width to preserve ratio, centred horizontally", () => {
      const next = aspectLockedResize("n", baseRect, { x: 0, y: 100 }, 2, bounds);
      // anchor = south edge midpoint (400, 400). Desired height = 300.
      // width = 300*2 = 600. x centred on 400 → x = 100.
      expect(next).toEqual({ x: 100, y: 100, width: 600, height: 300 });
    });
  });

  describe("edge handle 's' (south)", () => {
    it("changes height downward and adjusts width to preserve ratio, centred horizontally", () => {
      const next = aspectLockedResize("s", baseRect, { x: 0, y: 500 }, 2, bounds);
      // anchor = north edge midpoint (400, 200). Desired height = 500 - 200 = 300.
      // width = 300*2 = 600. centreX = 400 → x = 100. y = 200.
      expect(next).toEqual({ x: 100, y: 200, width: 600, height: 300 });
    });
  });

  describe("edge handle 'w' (west)", () => {
    it("changes width leftward and adjusts height to preserve ratio, centred vertically", () => {
      const next = aspectLockedResize("w", baseRect, { x: 100, y: 0 }, 2, bounds);
      // anchor = east edge (600, 300). Desired width = 600 - 100 = 500.
      // height = 500/2 = 250. centreY = 300 → y = 175. x = 600 - 500 = 100.
      expect(next).toEqual({ x: 100, y: 175, width: 500, height: 250 });
    });
  });

  it("returns prev for a NaN ratio", () => {
    expect(
      aspectLockedResize("se", baseRect, { x: 800, y: 500 }, Number.NaN, bounds),
    ).toEqual(baseRect);
  });

  it("returns previous rect when the handle is unrecognised", () => {
    // @ts-expect-error testing runtime guard
    expect(aspectLockedResize("bogus", baseRect, { x: 0, y: 0 }, 2, bounds)).toEqual(
      baseRect,
    );
  });
});
