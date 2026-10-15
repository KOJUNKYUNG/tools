import { describe, expect, it } from "vitest";
import {
  type ExifOrientation,
  type Matrix,
  orientationMatrix,
  orientedSize,
  readJpegOrientation,
} from "./jpegOrientation";
import { JPEG_3x2, solidPng, withExifOrientation } from "./testImages";

describe("readJpegOrientation", () => {
  it.each([1, 3, 6, 8] as const)("reads orientation %i (big-endian EXIF)", (o) => {
    expect(readJpegOrientation(withExifOrientation(JPEG_3x2, o, "MM"))).toBe(o);
  });

  it.each([2, 5, 7] as const)("reads orientation %i (little-endian EXIF)", (o) => {
    expect(readJpegOrientation(withExifOrientation(JPEG_3x2, o, "II"))).toBe(o);
  });

  it("follows the first EXIF segment, as browsers do", () => {
    const upright = withExifOrientation(withExifOrientation(JPEG_3x2, 6), 1);
    expect(readJpegOrientation(upright)).toBe(1);
  });

  it("skips fill bytes between segments", () => {
    const tagged = withExifOrientation(JPEG_3x2, 6);
    const padded = Uint8Array.from([...tagged.subarray(0, 2), 0xff, 0xff, ...tagged.subarray(2)]);
    expect(readJpegOrientation(padded)).toBe(6);
  });

  it.each([
    ["a JPEG without EXIF", JPEG_3x2],
    ["a PNG", solidPng(2, 2)],
    ["an out-of-range value", withExifOrientation(JPEG_3x2, 9)],
    ["a truncated EXIF segment", withExifOrientation(JPEG_3x2, 6).slice(0, 20)],
  ])("treats %s as upright (1)", (_, bytes) => {
    expect(readJpegOrientation(bytes)).toBe(1);
  });
});

describe("orientedSize", () => {
  it("keeps the size for orientations that do not turn the image", () => {
    for (const o of [1, 2, 3, 4] as const) expect(orientedSize(30, 20, o)).toEqual([30, 20]);
  });

  it("swaps width and height for orientations that turn it a quarter", () => {
    for (const o of [5, 6, 7, 8] as const) expect(orientedSize(30, 20, o)).toEqual([20, 30]);
  });
});

/**
 * Where the stored image's top-left, top-right and bottom-left corners must
 * appear once displayed, per the EXIF definition of each orientation ("row 0
 * is the visual …, column 0 is the visual …"). Row 0 runs from the first
 * corner to the second, column 0 from the first to the third.
 */
const EXPECTED: Record<ExifOrientation, [string, string, string]> = {
  1: ["TL", "TR", "BL"], // row 0 top, column 0 left
  2: ["TR", "TL", "BR"], // row 0 top, column 0 right
  3: ["BR", "BL", "TR"], // row 0 bottom, column 0 right
  4: ["BL", "BR", "TL"], // row 0 bottom, column 0 left
  5: ["TL", "BL", "TR"], // row 0 left, column 0 top
  6: ["TR", "BR", "TL"], // row 0 right, column 0 top
  7: ["BR", "TR", "BL"], // row 0 right, column 0 bottom
  8: ["BL", "TL", "BR"], // row 0 left, column 0 bottom
};

describe("orientationMatrix", () => {
  // PDF image space: u to the right, v up; the stored top row is v = 1.
  const W = 40;
  const H = 10;
  const corner = ([a, b, c, d, e, f]: Matrix, u: number, v: number) => {
    const x = a * u + c * v + e;
    const y = b * u + d * v + f;
    return `${y === H ? "T" : y === 0 ? "B" : "?"}${x === W ? "R" : x === 0 ? "L" : "?"}`;
  };

  it.each(Object.entries(EXPECTED))(
    "orientation %s shows the stored image upright in its displayed box",
    (o, [topLeft, topRight, bottomLeft]) => {
      // The keys of EXPECTED are exactly the eight orientations.
      const m = orientationMatrix(Number(o) as ExifOrientation, W, H);
      expect([corner(m, 0, 1), corner(m, 1, 1), corner(m, 0, 0)]).toEqual([
        topLeft,
        topRight,
        bottomLeft,
      ]);
    },
  );
});
