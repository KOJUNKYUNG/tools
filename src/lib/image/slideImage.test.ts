import { describe, expect, it } from "vitest";
import { maxFitCrop } from "./maxFitCrop";
import { fittedSize, preparedFormat } from "./slideImage";

/** Slide sizes in EMU, as `<p:sldSz>` stores them. */
const WIDE = { w: 12192000, h: 6858000 }; // 16:9
const STANDARD = { w: 9144000, h: 6858000 }; // 4:3
const A4_PORTRAIT = { w: 7560310, h: 10692130 };
const WIDE_16_10 = { w: 12192000, h: 7620000 };

const crop = (width: number, height: number) => ({ x: 0, y: 0, width, height });

describe("fittedSize", () => {
  it("fits a 16:9 crop inside 3840 × 2160", () => {
    expect(fittedSize(crop(4032, 2268), WIDE)).toEqual({ width: 3840, height: 2160 });
    expect(fittedSize(crop(8000, 4500), WIDE)).toEqual({ width: 3840, height: 2160 });
  });

  it("fits a 4:3 crop inside 2880 × 2160", () => {
    expect(fittedSize(crop(4032, 3024), STANDARD)).toEqual({ width: 2880, height: 2160 });
  });

  it("uses the 2160 × 3840 box for a portrait slide", () => {
    // A4 portrait is 1 : 1.4142; the width (3024 → 2160) binds before the height.
    expect(fittedSize(crop(3024, 4277), A4_PORTRAIT)).toEqual({ width: 2160, height: 3055 });
    expect(fittedSize(crop(2268, 4032), { w: 9, h: 16 })).toEqual({ width: 2160, height: 3840 });
  });

  it("fits an odd aspect by the side that binds first", () => {
    // 16:10 at 4000 × 2500: the height (2500 → 2160) binds before the width.
    expect(fittedSize(crop(4000, 2500), WIDE_16_10)).toEqual({ width: 3456, height: 2160 });
  });

  it("uses the landscape box for a square slide", () => {
    expect(fittedSize(crop(3000, 3000), { w: 1, h: 1 })).toEqual({ width: 2160, height: 2160 });
  });

  it("keeps a crop smaller than the box at its own pixel size", () => {
    expect(fittedSize(crop(1920, 1080), WIDE)).toEqual({ width: 1920, height: 1080 });
    expect(fittedSize(crop(2, 1), WIDE)).toEqual({ width: 2, height: 1 });
  });

  it("stays within 1 px of the slide aspect after rounding", () => {
    // Odd source sizes, cut to each slide's aspect as the default crop is.
    for (const [w, h] of [
      [5001, 2813],
      [4999, 3333],
      [4103, 2307],
      [6007, 4001],
    ]) {
      for (const slide of [WIDE, STANDARD, WIDE_16_10]) {
        const out = fittedSize(maxFitCrop({ w, h }, slide.w, slide.h), slide);
        expect(out.width).toBeLessThanOrEqual(3840);
        expect(out.height).toBeLessThanOrEqual(2160);
        expect(Math.abs(out.width - (out.height * slide.w) / slide.h)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("preparedFormat", () => {
  it("keeps a picture whose alpha is used as PNG, however small its JPEG", () => {
    expect(preparedFormat({ alphaUsed: true, jpegBytes: 10, pngBytes: 1000 })).toBe("png");
  });

  it("takes the JPEG when it is at most half the PNG", () => {
    expect(preparedFormat({ alphaUsed: false, jpegBytes: 400, pngBytes: 1000 })).toBe("jpeg");
    expect(preparedFormat({ alphaUsed: false, jpegBytes: 500, pngBytes: 1000 })).toBe("jpeg");
  });

  it("keeps PNG when the JPEG saves less than half (flat graphics, text)", () => {
    expect(preparedFormat({ alphaUsed: false, jpegBytes: 501, pngBytes: 1000 })).toBe("png");
    expect(preparedFormat({ alphaUsed: false, jpegBytes: 1200, pngBytes: 1000 })).toBe("png");
  });
});
