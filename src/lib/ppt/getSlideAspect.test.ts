// src/lib/ppt/getSlideAspect.test.ts
import { describe, it, expect } from "vitest";
import { aspectFromSldSz, slideSizeFromXml, type SlideAspect } from "./getSlideAspect";

describe("aspectFromSldSz", () => {
  it("classifies 16:9 (12192000 x 6858000)", () => {
    const a: SlideAspect = aspectFromSldSz(12192000, 6858000);
    expect(a.kind).toBe("16:9");
    expect(a.ratio).toBeCloseTo(16 / 9, 3);
  });

  it("classifies 4:3 (9144000 x 6858000)", () => {
    expect(aspectFromSldSz(9144000, 6858000).kind).toBe("4:3");
  });

  it("falls back to raw ratio for non-standard sizes", () => {
    const a = aspectFromSldSz(1000, 1000);
    expect(a.kind).toBe("other");
    expect(a.ratio).toBeCloseTo(1, 3);
  });

  it("defaults to 16:9 when dimensions are missing/invalid", () => {
    expect(aspectFromSldSz(0, 0).kind).toBe("16:9");
  });
});

describe("slideSizeFromXml", () => {
  it("reads cx and cy in either order", () => {
    expect(slideSizeFromXml('<p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>')).toEqual({ w: 9144000, h: 6858000 });
    expect(slideSizeFromXml('<p:sldSz cy="6858000" cx="9144000"/>')).toEqual({ w: 9144000, h: 6858000 });
  });

  it("is null when the size is missing or not positive", () => {
    expect(slideSizeFromXml("<p:presentation/>")).toBeNull();
    expect(slideSizeFromXml('<p:sldSz cx="0" cy="6858000"/>')).toBeNull();
  });
});
