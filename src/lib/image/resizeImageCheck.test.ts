import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { JPEG_3x2, noisePng, solidPng, stubBrowserDecoder } from "@/lib/pdf/testImages";
import { checkImageResize, type ImageResizeRequest } from "./resizeImageCheck";

beforeAll(stubBrowserDecoder);
afterAll(() => {
  vi.unstubAllGlobals();
});

/** A lossless WebP header of the given size (enough for header and stub decoder). */
function webp(width: number, height: number): Uint8Array {
  const b = Buffer.alloc(26);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(18, 4);
  b.write("WEBPVP8L", 8, "ascii");
  b.writeUInt32LE(5, 16);
  b[20] = 0x2f;
  b.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
  return Uint8Array.from(b);
}

const blob = (bytes: Uint8Array, type = "") => new Blob([new Uint8Array(bytes)], { type });

const properties = (violations: { property: string }[]) => violations.map((v) => v.property);

const request = (width: number, height: number, format: string): ImageResizeRequest => ({
  width,
  height,
  format,
});

describe("checkImageResize", () => {
  const input = blob(solidPng(40, 30), "image/png");

  it.each([
    ["PNG", "image/png", solidPng(20, 15), 20, 15],
    ["JPEG", "image/jpeg", JPEG_3x2, 3, 2],
    ["WebP", "image/webp", webp(7, 5), 7, 5],
  ])("finds nothing wrong in a good %s output, at both depths", async (_, format, bytes, width, height) => {
    const out = blob(bytes, format);
    expect(await checkImageResize(input, request(width, height, format), out, "quick")).toEqual([]);
    expect(await checkImageResize(input, request(width, height, format), out, "full")).toEqual([]);
  });

  it.each([
    ["one pixel too wide", 21, 15],
    ["one pixel too short", 20, 14],
    ["far off", 40, 30],
  ])("flags an output %s", async (_, width, height) => {
    const out = blob(solidPng(width, height), "image/png");
    expect(properties(await checkImageResize(input, request(20, 15, "image/png"), out, "quick"))).toEqual([
      "image-size",
    ]);
  });

  it("flags a PNG the canvas fell back to when it cannot encode the requested format", async () => {
    const out = blob(solidPng(20, 15), "image/png");
    expect(properties(await checkImageResize(input, request(20, 15, "image/webp"), out, "quick"))).toEqual([
      "image-format",
    ]);
  });

  it("flags a fallback PNG for a format the header reader does not know", async () => {
    const out = blob(solidPng(20, 15), "image/png");
    expect(properties(await checkImageResize(input, request(20, 15, "image/gif"), out, "quick"))).toEqual([
      "image-format",
    ]);
  });

  it("flags undecodable bytes", async () => {
    const out = blob(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), "image/png");
    expect(properties(await checkImageResize(input, request(20, 15, "image/png"), out, "quick"))).toEqual([
      "image-format",
      "image-decodes",
    ]);
  });

  it("flags an empty output", async () => {
    expect(
      properties(await checkImageResize(input, request(20, 15, "image/png"), blob(new Uint8Array(0)), "quick")),
    ).toEqual(["image-format", "image-decodes"]);
  });

  describe("size bound (full depth only)", () => {
    // A flat image of ~1 KB; random pixels barely compress (~90 KB at 200×150).
    const small = blob(solidPng(400, 300), "image/png");

    it("flags a downscaled output far above the input's size", async () => {
      const out = blob(noisePng(200, 150), "image/png");
      expect(await checkImageResize(small, request(200, 150, "image/png"), out, "quick")).toEqual([]);
      expect(properties(await checkImageResize(small, request(200, 150, "image/png"), out, "full"))).toEqual([
        "size-bound",
      ]);
    });

    it("lets an upscaled output grow", async () => {
      const out = blob(noisePng(500, 400), "image/png");
      expect(await checkImageResize(small, request(500, 400, "image/png"), out, "full")).toEqual([]);
    });
  });
});
