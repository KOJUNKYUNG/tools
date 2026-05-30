import { describe, it, expect } from "vitest";
import { SLIDE_SIZES, type SlideKind } from "./slideSize";
describe("SLIDE_SIZES", () => {
  it("16:9 is 13.333 x 7.5 inches", () => { expect(SLIDE_SIZES["16:9"]).toEqual({ w: 13.333, h: 7.5 }); });
  it("4:3 is 10 x 7.5 inches", () => { expect(SLIDE_SIZES["4:3"]).toEqual({ w: 10, h: 7.5 }); });
  it("aspect ratios are correct", () => { const a = SLIDE_SIZES["16:9"]; expect(a.w / a.h).toBeCloseTo(16 / 9, 2); });
});
