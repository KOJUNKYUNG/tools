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

// The 1×1 WebPs browsers' feature tests decode (Modernizr), one per bitstream.
const hex = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));
const WEBP_1x1_LOSSY = hex(
  "52494646220000005745425056503820160000003001009d012a010001000ec0fe25a400037000000000",
);
const WEBP_1x1_LOSSLESS = hex("524946461a000000574542505650384c0d0000002f00000010071011118888fe0700");
const WEBP_1x1_EXTENDED = hex(
  "524946464a00000057454250565038580a00000010000000000000000000414c50480c00000011071011fd0f4444ff03000056503820180000001401009d012a010001000000fe00000dc000fee6b5000000",
);

/** A WebP holding only the first chunk's size fields, per the WebP container spec. */
function webp(chunk: "VP8 " | "VP8L" | "VP8X", width: number, height: number): Uint8Array {
  const data = Buffer.alloc(10);
  if (chunk === "VP8 ") {
    data.set([0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a]); // key frame tag, start code
    data.writeUInt16LE(width, 6);
    data.writeUInt16LE(height, 8);
  } else if (chunk === "VP8L") {
    data[0] = 0x2f;
    data.writeUInt32LE(((width - 1) | ((height - 1) << 14)) >>> 0, 1);
  } else {
    data.writeUIntLE(width - 1, 4, 3);
    data.writeUIntLE(height - 1, 7, 3);
  }
  const head = Buffer.alloc(20);
  head.write("RIFF", 0, "ascii");
  head.writeUInt32LE(12 + data.length, 4);
  head.write("WEBP", 8, "ascii");
  head.write(chunk, 12, "ascii");
  head.writeUInt32LE(data.length, 16);
  return Uint8Array.from(Buffer.concat([head, data]));
}

function riffWave(): Uint8Array {
  const bytes = webp("VP8 ", 640, 480);
  bytes.set(new TextEncoder().encode("WAVE"), 8);
  return bytes;
}

function corrupt(bytes: Uint8Array, at: number): Uint8Array {
  const copy = bytes.slice();
  copy[at] ^= 0xff;
  return copy;
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
    ["lossy", WEBP_1x1_LOSSY],
    ["lossless", WEBP_1x1_LOSSLESS],
    ["extended", WEBP_1x1_EXTENDED],
  ])("reads a 1×1 %s WebP", (_, bytes) => {
    expect(readImageHeader(bytes)).toEqual({ format: "webp", width: 1, height: 1, orientation: 1 });
  });

  it.each([
    ["lossy", "VP8 ", 640, 480],
    ["lossless", "VP8L", 16384, 3],
    ["extended", "VP8X", 20000, 7],
  ] as const)("reads a larger %s WebP's size", (_, chunk, width, height) => {
    expect(readImageHeader(webp(chunk, width, height))).toEqual({
      format: "webp",
      width,
      height,
      orientation: 1,
    });
  });

  it.each([
    ["garbage", new TextEncoder().encode("not an image at all")],
    ["empty", new Uint8Array(0)],
    ["a truncated PNG", png(2, 3).slice(0, 20)],
    ["a PNG signature without an IHDR chunk", corrupt(png(2, 3), 12)],
    ["a JPEG cut before its frame header", jpeg(640, 480).slice(0, 12)],
    ["a RIFF file that is not WebP", riffWave()],
    ["a lossy WebP cut before its size", WEBP_1x1_LOSSY.slice(0, 28)],
    ["a lossless WebP cut before its size", WEBP_1x1_LOSSLESS.slice(0, 22)],
    ["an extended WebP cut before its size", WEBP_1x1_EXTENDED.slice(0, 28)],
    ["a lossy WebP without its start code", corrupt(WEBP_1x1_LOSSY, 23)],
    ["a lossless WebP without its signature", corrupt(WEBP_1x1_LOSSLESS, 20)],
  ])("rejects %s", (_, bytes) => {
    expect(readImageHeader(bytes)).toBeNull();
  });
});
