import { describe, expect, it } from "vitest";
import { veil } from "./pixelFilters";

/** RGBA pixels, four numbers each. */
const pixels = (...rgba: number[]) => Uint8ClampedArray.from(rgba);

describe("veil", () => {
  it("leaves pixels unchanged at 0", () => {
    const picture = pixels(10, 128, 250, 255, 0, 0, 0, 40);
    veil(picture, 0);
    expect([...picture]).toEqual([10, 128, 250, 255, 0, 0, 0, 40]);
  });

  it("a dark veil scales R, G and B alike", () => {
    const picture = pixels(200, 100, 50, 255);
    veil(picture, -0.5);
    expect([...picture]).toEqual([100, 50, 25, 255]);
  });

  it("a light veil moves R, G and B towards 255", () => {
    const picture = pixels(55, 155, 255, 255);
    veil(picture, 0.5);
    expect([...picture]).toEqual([155, 205, 255, 255]);
  });

  it("leaves alpha untouched", () => {
    const picture = pixels(200, 100, 50, 0, 200, 100, 50, 128);
    veil(picture, -0.6);
    expect([picture[3], picture[7]]).toEqual([0, 128]);
    veil(picture, 0.6);
    expect([picture[3], picture[7]]).toEqual([0, 128]);
  });
});
