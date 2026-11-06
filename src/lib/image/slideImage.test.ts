import { describe, expect, it } from "vitest";
import { maxFitCrop } from "./maxFitCrop";
import { belowFullHd, containedSize, filledSize, fittedSize, preparedFormat } from "./slideImage";

/** Slide sizes in EMU, as `<p:sldSz>` stores them. */
const WIDE = { w: 12192000, h: 6858000 }; // 16:9
const STANDARD = { w: 9144000, h: 6858000 }; // 4:3
const A4_PORTRAIT = { w: 7560310, h: 10692130 };
const WIDE_16_10 = { w: 12192000, h: 7620000 };

const crop = (width: number, height: number) => ({ x: 0, y: 0, width, height });

describe("containedSize", () => {
  const size = (width: number, height: number) => ({ width, height });

  it("fits a portrait phone photo inside the slide on Full HD by its height", () => {
    expect(containedSize(size(3024, 4032), WIDE, "full-hd")).toEqual(size(810, 1080));
    expect(containedSize(size(1241, 1755), WIDE, "full-hd")).toEqual(size(764, 1080));
  });

  it("fits a landscape photo inside the slide on Full HD by the side that binds first", () => {
    expect(containedSize(size(4032, 3024), WIDE, "full-hd")).toEqual(size(1440, 1080));
    expect(containedSize(size(4000, 1000), WIDE, "full-hd")).toEqual(size(1920, 480));
  });

  it("holds a 4:3 slide to its own rectangle on the screen, not the whole screen", () => {
    expect(containedSize(size(4000, 3000), STANDARD, "full-hd")).toEqual(size(1440, 1080));
    expect(containedSize(size(4000, 1000), STANDARD, "full-hd")).toEqual(size(1440, 360));
    expect(containedSize(size(4000, 3000), STANDARD, "4k")).toEqual(size(2880, 2160));
  });

  it("sizes for 4K when asked, and when the screen is omitted", () => {
    expect(containedSize(size(3024, 4032), WIDE, "4k")).toEqual(size(1620, 2160));
    expect(containedSize(size(3024, 4032), WIDE)).toEqual(size(1620, 2160));
  });

  it("uses the screen in the slide's orientation", () => {
    // The portrait slide's rectangle is 1080 × 1920: its width binds here.
    expect(containedSize(size(3024, 4032), { w: 9, h: 16 }, "full-hd")).toEqual(size(1080, 1440));
    expect(containedSize(size(4032, 3024), { w: 9, h: 16 }, "full-hd")).toEqual(size(1080, 810));
  });

  it("never enlarges a picture smaller than the slide's rectangle", () => {
    expect(containedSize(size(800, 600), WIDE, "full-hd")).toEqual(size(800, 600));
    expect(containedSize(size(1920, 1080), WIDE, "full-hd")).toEqual(size(1920, 1080));
    expect(containedSize(size(2, 1), WIDE, "4k")).toEqual(size(2, 1));
  });

  it("keeps a very thin picture at least a pixel on its short side", () => {
    expect(containedSize(size(10000, 2), WIDE, "full-hd")).toEqual(size(1920, 1));
  });
});

describe("filledSize on a chosen screen", () => {
  it("is the largest rectangle of the slide's aspect that screen holds", () => {
    expect(filledSize(WIDE, "full-hd")).toEqual({ width: 1920, height: 1080 });
    expect(filledSize(STANDARD, "full-hd")).toEqual({ width: 1440, height: 1080 });
    expect(filledSize(WIDE, "4k")).toEqual(filledSize(WIDE));
  });
});

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

  it("fits a crop inside the slide's rectangle on Full HD when asked", () => {
    expect(fittedSize(crop(4032, 2268), WIDE, "full-hd")).toEqual({ width: 1920, height: 1080 });
    expect(fittedSize(crop(4032, 3024), STANDARD, "full-hd")).toEqual({ width: 1440, height: 1080 });
    expect(fittedSize(crop(1600, 900), WIDE, "full-hd")).toEqual({ width: 1600, height: 900 });
  });

  it("means 4K when no screen size is given", () => {
    expect(fittedSize(crop(4032, 2268), WIDE, "4k")).toEqual({ width: 3840, height: 2160 });
    expect(fittedSize(crop(4032, 3024), STANDARD)).toEqual(fittedSize(crop(4032, 3024), STANDARD, "4k"));
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

describe("filledSize", () => {
  it("fills the 4K box at the slide's aspect, in its orientation", () => {
    expect(filledSize(WIDE)).toEqual({ width: 3840, height: 2160 });
    expect(filledSize(STANDARD)).toEqual({ width: 2880, height: 2160 });
    expect(filledSize(WIDE_16_10)).toEqual({ width: 3456, height: 2160 });
    expect(filledSize(A4_PORTRAIT)).toEqual({ width: 2160, height: 3055 });
    expect(filledSize({ w: 9, h: 16 })).toEqual({ width: 2160, height: 3840 });
    expect(filledSize({ w: 2, h: 1 })).toEqual({ width: 3840, height: 1920 });
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

describe("belowFullHd", () => {
  it("compares a landscape or square slide's crop width with 1920", () => {
    expect(belowFullHd(crop(1919, 1079), WIDE)).toBe(true);
    expect(belowFullHd(crop(1920, 1080), WIDE)).toBe(false);
    expect(belowFullHd(crop(1919, 1919), { w: 1, h: 1 })).toBe(true);
    expect(belowFullHd(crop(1920, 1440), STANDARD)).toBe(false);
  });

  it("compares a portrait slide's crop height with 1920", () => {
    expect(belowFullHd(crop(1080, 1919), { w: 9, h: 16 })).toBe(true);
    expect(belowFullHd(crop(1358, 1920), A4_PORTRAIT)).toBe(false);
  });
});
