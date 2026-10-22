import { describe, expect, it } from "vitest";
import { cropFits, maxFitCrop } from "./maxFitCrop";

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

describe("cropFits", () => {
  const image = { w: 4032, h: 3024 };
  const wide = 16 / 9;

  it("accepts a crop inside the image on the ratio, to within 1 px", () => {
    expect(cropFits({ x: 0, y: 378, width: 4032, height: 2268 }, image, wide)).toBe(true);
    expect(cropFits({ x: 10, y: 10, width: 1601, height: 900 }, image, wide)).toBe(true);
  });

  it("rejects a crop off the ratio, outside the image, or empty", () => {
    expect(cropFits({ x: 0, y: 0, width: 1603, height: 900 }, image, wide)).toBe(false);
    expect(cropFits({ x: 0, y: 0, width: 2880, height: 2160 }, image, wide)).toBe(false);
    expect(cropFits({ x: 100, y: 1000, width: 4032, height: 2268 }, image, wide)).toBe(false);
    expect(cropFits({ x: -1, y: 0, width: 1600, height: 900 }, image, wide)).toBe(false);
    expect(cropFits({ x: 0, y: 0, width: 0, height: 0 }, image, wide)).toBe(false);
  });
});

describe("maxFitCrop holds odd slide ratios to 1 px", () => {
  it("stays within 1 px of the ratio on both sides, even past 2:1", () => {
    for (const ratio of [16 / 9, 4 / 3, 32 / 9, 3, 1 / 3, 9 / 32, 0.7071]) {
      for (const [w, h] of [[4032, 3024], [3024, 4032], [5001, 2813], [1999, 1001], [801, 3001]]) {
        const crop = maxFitCrop({ w, h }, ratio, 1);
        expect(cropFits(crop, { w, h }, ratio)).toBe(true);
      }
    }
  });
});
