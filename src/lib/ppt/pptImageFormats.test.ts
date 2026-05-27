import { describe, expect, it } from "vitest";
import {
  formatBreakdownString,
  getExt,
  getMime,
  isRenderable,
} from "./pptImageFormats";

describe("pptImageFormats", () => {
  it("getExt extracts lowercase extension without dot", () => {
    expect(getExt("image_1.PNG")).toBe("png");
    expect(getExt("a.b.jpeg")).toBe("jpeg");
    expect(getExt("noext")).toBe("");
    expect(getExt("trailing.")).toBe("");
  });

  it("getMime maps known extensions", () => {
    expect(getMime("png")).toBe("image/png");
    expect(getMime("jpg")).toBe("image/jpeg");
    expect(getMime("jpeg")).toBe("image/jpeg");
    expect(getMime("gif")).toBe("image/gif");
    expect(getMime("bmp")).toBe("image/bmp");
    expect(getMime("tiff")).toBe("image/tiff");
    expect(getMime("tif")).toBe("image/tiff");
    expect(getMime("svg")).toBe("image/svg+xml");
    expect(getMime("emf")).toBe("application/octet-stream");
    expect(getMime("wmf")).toBe("application/octet-stream");
    expect(getMime("zzz")).toBe("application/octet-stream");
  });

  it("isRenderable returns true only for browser-displayable raster formats", () => {
    expect(isRenderable("png")).toBe(true);
    expect(isRenderable("jpg")).toBe(true);
    expect(isRenderable("jpeg")).toBe(true);
    expect(isRenderable("gif")).toBe(true);
    expect(isRenderable("bmp")).toBe(true);
    expect(isRenderable("tiff")).toBe(false);
    expect(isRenderable("svg")).toBe(false);
    expect(isRenderable("emf")).toBe(false);
    expect(isRenderable("wmf")).toBe(false);
    expect(isRenderable("")).toBe(false);
  });

  it("formatBreakdownString sorts by count desc and joins with separator", () => {
    expect(
      formatBreakdownString({ PNG: 12, JPG: 3, EMF: 2 }),
    ).toBe("PNG 12 · JPG 3 · EMF 2");
    expect(formatBreakdownString({})).toBe("");
    expect(formatBreakdownString({ A: 1 })).toBe("A 1");
  });
});
