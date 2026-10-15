import { describe, expect, it } from "vitest";
import { solidPng as png } from "@/lib/pdf/testImages";
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

describe("readImageHeader", () => {
  it("reads a PNG's format and pixel size", () => {
    expect(readImageHeader(png(2, 3))).toEqual({ format: "png", width: 2, height: 3 });
  });

  it("reads a baseline JPEG's size from its frame header", () => {
    expect(readImageHeader(jpeg(640, 480))).toEqual({ format: "jpeg", width: 640, height: 480 });
  });

  it("reads a progressive JPEG", () => {
    expect(readImageHeader(jpeg(300, 200, 0xc2))).toEqual({
      format: "jpeg",
      width: 300,
      height: 200,
    });
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
