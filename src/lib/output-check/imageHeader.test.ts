import { describe, expect, it } from "vitest";
import { JPEG_3x2, solidPng as png, withExifOrientation } from "@/lib/pdf/testImages";
import { readImageHeader } from "./imageHeader";

/** A JPEG whose frame header follows an APP0 segment, as camera files do. */
function jpeg(width: number, height: number, sof = 0xc0): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46]; // length 6
  const frame = [
    0xff, sof, 0x00, 0x0b, 0x08,
    height >> 8, height & 0xff, width >> 8, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
  ];
  return Uint8Array.from([0xff, 0xd8, ...app0, ...frame, 0xff, 0xd9]);
}

/** Offset of the first `ff <marker>` in `bytes` (the JPEG minus its SOI). */
function findMarker(bytes: Uint8Array, marker: number): number {
  for (let i = 0; i + 1 < bytes.length; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === marker) return i;
  }
  throw new Error(`marker ${marker.toString(16)} not found`);
}

describe("readImageHeader", () => {
  it("reads a PNG's format and pixel size", () => {
    expect(readImageHeader(png(2, 3))).toEqual({ format: "png", width: 2, height: 3, orientation: 1 });
  });

  it("reads a baseline JPEG's size from its frame header", () => {
    expect(readImageHeader(jpeg(640, 480))).toEqual({
      format: "jpeg",
      width: 640,
      height: 480,
      orientation: 1,
    });
  });

  it("reads a progressive JPEG", () => {
    expect(readImageHeader(jpeg(300, 200, 0xc2))).toEqual({
      format: "jpeg",
      width: 300,
      height: 200,
      orientation: 1,
    });
  });

  it.each([
    [6, "MM"],
    [8, "II"],
    [3, "MM"],
  ] as const)("reads EXIF orientation %i (%s byte order)", (orientation, order) => {
    expect(readImageHeader(withExifOrientation(JPEG_3x2, orientation, order))).toEqual({
      format: "jpeg",
      width: 3,
      height: 2,
      orientation,
    });
  });

  it("follows the first EXIF segment, as browsers do", () => {
    const upright = withExifOrientation(withExifOrientation(JPEG_3x2, 6), 1);
    expect(readImageHeader(upright)?.orientation).toBe(1);
  });

  it("reads an EXIF segment placed after the frame header", () => {
    // Browsers read every metadata segment up to the image data.
    const tagged = withExifOrientation(JPEG_3x2, 6);
    const app1Length = 4 + 6 + 26; // marker + length, "Exif\0\0", TIFF
    const app1 = tagged.subarray(2, 2 + app1Length);
    const plain = tagged.subarray(2 + app1Length);
    const sof = findMarker(plain, 0xc0);
    const moved = Uint8Array.from([
      0xff, 0xd8,
      ...plain.subarray(0, sof),
      ...plain.subarray(sof, sof + 2 + ((plain[sof + 2] << 8) | plain[sof + 3])),
      ...app1,
      ...plain.subarray(sof + 2 + ((plain[sof + 2] << 8) | plain[sof + 3])),
    ]);
    expect(readImageHeader(moved)).toEqual({ format: "jpeg", width: 3, height: 2, orientation: 6 });
  });

  it.each([
    ["garbage", new TextEncoder().encode("not an image at all")],
    ["empty", new Uint8Array(0)],
    ["a truncated PNG", png(2, 3).slice(0, 20)],
    ["a JPEG cut before its frame header", jpeg(640, 480).slice(0, 12)],
  ])("rejects %s", (_, bytes) => {
    expect(readImageHeader(bytes)).toBeNull();
  });
});
