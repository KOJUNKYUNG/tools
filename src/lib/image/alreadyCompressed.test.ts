import { describe, it, expect } from "vitest";
import { countColors, estimateJpegQuality, ijgTable, readPngHeader } from "./alreadyCompressed";

/** A minimal JPEG head: SOI, the given DQT segments, then SOS. */
function jpeg(...dqts: Uint8Array[]): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, ...dqts.flatMap((d) => [...d]), 0xff, 0xda, 0x00, 0x02]);
}

/** One DQT segment holding 8-bit tables, each `[id, 64 values]`. */
function dqt(...tables: [number, number[]][]): Uint8Array {
  const body = tables.flatMap(([id, values]) => [id, ...values]);
  const length = body.length + 2;
  return Uint8Array.from([0xff, 0xdb, length >> 8, length & 0xff, ...body]);
}

describe("estimateJpegQuality", () => {
  it.each([10, 30, 55, 70, 82, 95, 100])("reads back an IJG colour JPEG saved at %i", (q) => {
    const bytes = jpeg(dqt([0, ijgTable("luma", q)], [1, ijgTable("chroma", q)]));
    expect(estimateJpegQuality(bytes)).toBe(q);
  });

  it("reads tables split across DQT segments", () => {
    const bytes = jpeg(dqt([0, ijgTable("luma", 70)]), dqt([1, ijgTable("chroma", 70)]));
    expect(estimateJpegQuality(bytes)).toBe(70);
  });

  it("reads a greyscale JPEG from its one table", () => {
    expect(estimateJpegQuality(jpeg(dqt([0, ijgTable("luma", 60)])))).toBe(60);
  });

  it("reads 16-bit tables", () => {
    const values = ijgTable("luma", 40);
    const body = [0x10, ...values.flatMap((v) => [v >> 8, v & 0xff])];
    const length = body.length + 2;
    const seg = Uint8Array.from([0xff, 0xdb, length >> 8, length & 0xff, ...body]);
    expect(estimateJpegQuality(jpeg(seg))).toBe(40);
  });

  it("maps non-IJG tables to the nearest IJG quality", () => {
    // Every entry a little finer than IJG 80's: reads as a bit above 80.
    const luma = ijgTable("luma", 80).map((v) => Math.max(1, v - 1));
    const chroma = ijgTable("chroma", 80).map((v) => Math.max(1, v - 1));
    const q = estimateJpegQuality(jpeg(dqt([0, luma], [1, chroma])));
    expect(q).toBeGreaterThan(80);
    expect(q).toBeLessThanOrEqual(90);
  });

  it("returns null without quantization tables or for a non-JPEG", () => {
    expect(estimateJpegQuality(jpeg())).toBeNull();
    expect(estimateJpegQuality(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(estimateJpegQuality(new Uint8Array())).toBeNull();
  });

  it("returns null for a truncated table", () => {
    const seg = dqt([0, ijgTable("luma", 70)]).subarray(0, 30);
    expect(estimateJpegQuality(jpeg(seg))).toBeNull();
  });
});

describe("readPngHeader", () => {
  function png(colorType: number): Uint8Array {
    const head = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
    const ihdr = [..."IHDR"].map((c) => c.charCodeAt(0));
    return Uint8Array.from([...head, ...ihdr, 0, 0, 2, 0, 0, 0, 1, 44, 8, colorType, 0, 0, 0]);
  }

  it("reads the size and colour type", () => {
    expect(readPngHeader(png(3))).toEqual({ width: 512, height: 300, colorType: 3 });
    expect(readPngHeader(png(6))?.colorType).toBe(6);
  });

  it("is null for non-PNG bytes", () => {
    expect(readPngHeader(Uint8Array.from([0xff, 0xd8]))).toBeNull();
    expect(readPngHeader(new Uint8Array(30))).toBeNull();
  });
});

describe("countColors", () => {
  /** RGBA pixels from [r, g, b, a] tuples. */
  const rgba = (...px: number[][]) => Uint8ClampedArray.from(px.flat());

  it("counts distinct RGBA values", () => {
    const px = rgba([0, 0, 0, 255], [255, 255, 255, 255], [0, 0, 0, 255], [0, 0, 0, 128]);
    expect(countColors(px, 10)).toEqual({ colors: 3, opaque: false });
  });

  it("knows when every pixel is opaque", () => {
    const px = rgba([0, 0, 0, 255], [255, 255, 255, 255]);
    expect(countColors(px, 10)).toEqual({ colors: 2, opaque: true });
  });

  it("stops one past the cap", () => {
    const px = Uint8ClampedArray.from({ length: 100 * 4 }, (_, i) => (i % 4 === 3 ? 255 : i >> 2));
    expect(countColors(px, 10).colors).toBe(11);
  });

  it("is 0 for no pixels", () => {
    expect(countColors(new Uint8ClampedArray(), 10)).toEqual({ colors: 0, opaque: true });
  });
});
