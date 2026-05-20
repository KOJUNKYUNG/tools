import { describe, expect, it } from "vitest";
import { maxFitCrop } from "./maxFitCrop";

describe("maxFitCrop", () => {
  it("returns a centred crop when target ratio matches the image ratio", () => {
    expect(maxFitCrop({ w: 1000, h: 500 }, 2, 1)).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 500,
    });
  });

  it("fills width and centres vertically when target is wider than image", () => {
    // 300×400 image (portrait), 4:3 target (landscape) → width-limited
    expect(maxFitCrop({ w: 300, h: 400 }, 4, 3)).toEqual({
      x: 0,
      y: Math.round((400 - 225) / 2),
      width: 300,
      height: 225,
    });
  });

  it("fills height and centres horizontally when target is taller than image", () => {
    // 1000×500 image (landscape), 9:16 target (portrait) → height-limited
    expect(maxFitCrop({ w: 1000, h: 500 }, 9, 16)).toEqual({
      x: Math.round((1000 - Math.round(500 * 9 / 16)) / 2),
      y: 0,
      width: Math.round(500 * 9 / 16),
      height: 500,
    });
  });

  it("handles square target on landscape image", () => {
    expect(maxFitCrop({ w: 1000, h: 500 }, 1, 1)).toEqual({
      x: Math.round((1000 - 500) / 2),
      y: 0,
      width: 500,
      height: 500,
    });
  });

  it("handles square target on portrait image", () => {
    expect(maxFitCrop({ w: 500, h: 1000 }, 1, 1)).toEqual({
      x: 0,
      y: Math.round((1000 - 500) / 2),
      width: 500,
      height: 500,
    });
  });

  it("rounds to integer pixels", () => {
    // 1000×500, 16:9 → width-limited: cropH = 1000 * 9/16 = 562.5 → 563.
    // But 563 > 500, so height-limited instead: cropW = 500 * 16/9 ≈ 888.89 → 889
    const result = maxFitCrop({ w: 1000, h: 500 }, 16, 9);
    expect(Number.isInteger(result.x)).toBe(true);
    expect(Number.isInteger(result.y)).toBe(true);
    expect(Number.isInteger(result.width)).toBe(true);
    expect(Number.isInteger(result.height)).toBe(true);
    expect(result.width).toBe(889);
    expect(result.height).toBe(500);
  });

  it("returns a zero-size rect for non-positive image dims", () => {
    expect(maxFitCrop({ w: 0, h: 500 }, 1, 1)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
    expect(maxFitCrop({ w: 100, h: 0 }, 1, 1)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });

  it("returns a zero-size rect for non-positive target dims", () => {
    expect(maxFitCrop({ w: 100, h: 100 }, 0, 1)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
});
