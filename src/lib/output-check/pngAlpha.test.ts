import { describe, expect, it } from "vitest";
import { testPng } from "@/lib/image/testPng";
import { pngAlphaUsed } from "./pngAlpha";

const W = 37;
const H = 23;
/** True only at the last pixel, so a scan that stops early misses it. */
const last = (x: number, y: number) => x === W - 1 && y === H - 1;
/** A pattern that changes along both axes, so every row filter does work. */
const shade = (x: number, y: number) => (x * 7 + y * 13) & 0xff;

describe("pngAlphaUsed", () => {
  it("finds one pixel below full opacity in an RGBA picture", async () => {
    const rgba = (alpha: (x: number, y: number) => number) =>
      testPng({ width: W, height: H, colorType: 6, pixel: (x, y) => [shade(x, y), y, x, alpha(x, y)] });
    expect(await pngAlphaUsed(rgba(() => 255))).toBe(false);
    expect(await pngAlphaUsed(rgba((x, y) => (last(x, y) ? 254 : 255)))).toBe(true);
  });

  it("reads 16-bit alpha and grey + alpha", async () => {
    const rgba16 = (a: number) =>
      testPng({
        width: W,
        height: H,
        colorType: 6,
        bitDepth: 16,
        pixel: (x, y) => [shade(x, y) * 257, 0, 0, last(x, y) ? a : 65535],
      });
    expect(await pngAlphaUsed(rgba16(65535))).toBe(false);
    expect(await pngAlphaUsed(rgba16(65534))).toBe(true);

    const greyAlpha = (a: number) =>
      testPng({ width: W, height: H, colorType: 4, pixel: (x, y) => [shade(x, y), last(x, y) ? a : 255] });
    expect(await pngAlphaUsed(greyAlpha(255))).toBe(false);
    expect(await pngAlphaUsed(greyAlpha(0))).toBe(true);
  });

  it("scans every pass of an interlaced picture", async () => {
    // Adam7's last pass holds the odd rows; (W-1, H-2) is in it.
    const png = (transparent: boolean) =>
      testPng({
        width: W,
        height: H,
        colorType: 6,
        interlace: true,
        pixel: (x, y) => [shade(x, y), 0, 0, transparent && x === W - 1 && y === H - 2 ? 10 : 255],
      });
    expect(await pngAlphaUsed(png(false))).toBe(false);
    expect(await pngAlphaUsed(png(true))).toBe(true);
  });

  it("reads compressed data spread over several IDAT chunks", async () => {
    const png = testPng({
      width: W,
      height: H,
      colorType: 6,
      idatChunks: 7,
      pixel: (x, y) => [shade(x, y), 0, 0, last(x, y) ? 0 : 255],
    });
    expect(await pngAlphaUsed(png)).toBe(true);
  });

  it("treats a picture without alpha or tRNS as opaque, without reading its pixels", async () => {
    const rgb = testPng({ width: W, height: H, colorType: 2, pixel: (x, y) => [shade(x, y), 0, 0] });
    expect(await pngAlphaUsed(rgb)).toBe(false);
  });

  it("finds a tRNS key colour only where a pixel has it", async () => {
    const rgb = (keyed: boolean) =>
      testPng({
        width: W,
        height: H,
        colorType: 2,
        trns: [1, 2, 3],
        pixel: (x, y) => (keyed && last(x, y) ? [1, 2, 3] : [1, 2, 4]),
      });
    expect(await pngAlphaUsed(rgb(false))).toBe(false);
    expect(await pngAlphaUsed(rgb(true))).toBe(true);

    const grey4 = (keyed: boolean) =>
      testPng({
        width: W,
        height: H,
        colorType: 0,
        bitDepth: 4,
        trns: [9],
        pixel: (x, y) => [keyed && last(x, y) ? 9 : 8],
      });
    expect(await pngAlphaUsed(grey4(false))).toBe(false);
    expect(await pngAlphaUsed(grey4(true))).toBe(true);
  });

  it("counts a translucent palette entry only when a pixel uses it", async () => {
    const indexed = (trns: number[], useEntry2: boolean) =>
      testPng({
        width: W,
        height: H,
        colorType: 3,
        bitDepth: 2,
        palette: [
          [0, 0, 0],
          [255, 255, 255],
          [255, 0, 0],
        ],
        trns,
        pixel: (x, y) => [useEntry2 && last(x, y) ? 2 : (x + y) % 2],
      });
    expect(await pngAlphaUsed(indexed([255, 255, 128], false))).toBe(false);
    expect(await pngAlphaUsed(indexed([255, 255, 128], true))).toBe(true);
    expect(await pngAlphaUsed(indexed([255, 255, 255], true))).toBe(false);
  });

  it("returns null for bytes it cannot read as a PNG", async () => {
    expect(await pngAlphaUsed(new TextEncoder().encode("not a png"))).toBeNull();
    const png = testPng({ width: W, height: H, colorType: 6, pixel: (x, y) => [shade(x, y), 0, 0, 255] });
    // Cut inside the IDAT: the rows run out before the picture does.
    const idat = Buffer.from(png).indexOf("IDAT");
    expect(await pngAlphaUsed(png.subarray(0, idat + 20))).toBeNull();
  });
});
