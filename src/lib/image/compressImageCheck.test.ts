import JSZip from "jszip";
import { crc32 } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  JPEG_3x2,
  solidPng,
  stubBrowserDecoder,
  withExifOrientation,
} from "@/lib/pdf/testImages";
import {
  checkCompressedImage,
  checkCompressZip,
  type CompressedImageRequest,
} from "./compressImageCheck";

beforeAll(stubBrowserDecoder);
afterAll(() => {
  vi.unstubAllGlobals();
});

const blob = (bytes: Uint8Array, type = "") => new Blob([new Uint8Array(bytes)], { type });

const properties = (violations: { property: string }[]) => violations.map((v) => v.property);

const request = (
  format: CompressedImageRequest["format"],
  sameFormat = false,
): CompressedImageRequest => ({ format, sameFormat });

describe("checkCompressedImage", () => {
  it("finds nothing wrong in a good conversion, at both depths", async () => {
    const input = blob(solidPng(3, 2), "image/png");
    const out = blob(JPEG_3x2, "image/jpeg");
    expect(await checkCompressedImage(input, request("image/jpeg"), out, "quick")).toEqual([]);
    expect(await checkCompressedImage(input, request("image/jpeg"), out, "full")).toEqual([]);
  });

  it("flags an output whose size differs from the input's", async () => {
    const input = blob(solidPng(40, 30), "image/png");
    const out = blob(solidPng(40, 29), "image/png");
    expect(properties(await checkCompressedImage(input, request("image/png"), out, "quick"))).toEqual([
      "image-size",
    ]);
  });

  it("compares sizes as displayed: a phone photo comes out turned upright", async () => {
    // Stored 3×2 with EXIF orientation 6: shown, and drawn by a canvas, as 2×3.
    const input = blob(withExifOrientation(JPEG_3x2, 6), "image/jpeg");
    expect(await checkCompressedImage(input, request("image/png"), blob(solidPng(2, 3)), "quick")).toEqual([]);
    expect(properties(await checkCompressedImage(input, request("image/png"), blob(solidPng(3, 2)), "quick"))).toEqual([
      "image-size",
    ]);
  });

  it.each([
    ["a WebP with an EXIF chunk", () => extendedWebp(4, 3, { exif: true })],
    ["a PNG with an eXIf chunk", () => pngWithExif(4, 3)],
  ])("skips the size check for %s: the browser may turn it by an orientation not read here", async (_, bytes) => {
    const input = blob(bytes());
    // Drawn turned a quarter: 3×4.
    expect(await checkCompressedImage(input, request("image/png"), blob(solidPng(3, 4)), "quick")).toEqual([]);
  });

  it("still checks the size of a WebP or PNG without orientation metadata", async () => {
    for (const bytes of [extendedWebp(4, 3, { exif: false }), solidPng(4, 3)]) {
      expect(
        properties(await checkCompressedImage(blob(bytes), request("image/png"), blob(solidPng(3, 4)), "quick")),
      ).toEqual(["image-size"]);
    }
  });

  it("skips the size check when the input's header cannot be read", async () => {
    const input = blob(Uint8Array.from([1, 2, 3]), "image/jpeg");
    expect(await checkCompressedImage(input, request("image/png"), blob(solidPng(5, 5)), "quick")).toEqual([]);
  });

  it("flags a PNG the canvas fell back to when it cannot encode the requested format", async () => {
    const input = blob(solidPng(3, 2), "image/png");
    expect(properties(await checkCompressedImage(input, request("image/webp"), blob(solidPng(3, 2)), "quick"))).toEqual([
      "image-format",
    ]);
  });

  it("flags bytes that are no image at all as unreadable, not as another format", async () => {
    const input = blob(solidPng(3, 2), "image/png");
    const out = blob(Uint8Array.from([0xff, 0xd8, 0, 0, 0]), "image/jpeg");
    expect(properties(await checkCompressedImage(input, request("image/jpeg"), out, "quick"))).toEqual([
      "image-header",
      "image-decodes",
    ]);
  });

  it("flags an image the browser cannot decode", async () => {
    vi.stubGlobal("createImageBitmap", async () => {
      throw new DOMException("The source image could not be decoded.", "InvalidStateError");
    });
    try {
      const input = blob(solidPng(3, 2), "image/png");
      expect(properties(await checkCompressedImage(input, request("image/png"), blob(solidPng(3, 2)), "quick"))).toEqual([
        "image-decodes",
      ]);
    } finally {
      stubBrowserDecoder();
    }
  });

  describe("size bound", () => {
    const input = blob(solidPng(40, 30), "image/png");
    const larger = new Blob([new Uint8Array(solidPng(40, 30)), new Uint8Array(10)], { type: "image/png" });

    it("flags a same-format output that is not smaller than its input", async () => {
      const same = blob(solidPng(40, 30), "image/png");
      expect(properties(await checkCompressedImage(input, request("image/png", true), same, "quick"))).toEqual([
        "size-bound",
      ]);
      expect(properties(await checkCompressedImage(input, request("image/png", true), larger, "quick"))).toEqual([
        "size-bound",
      ]);
    });

    it("lets a format conversion come out larger: it is what the user asked for", async () => {
      expect(await checkCompressedImage(input, request("image/png", false), larger, "quick")).toEqual([]);
    });
  });
});

/** An extended (VP8X) WebP header of the given canvas size, flagging an EXIF chunk or not. */
function extendedWebp(width: number, height: number, { exif }: { exif: boolean }): Uint8Array {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(22, 4);
  b.write("WEBPVP8X", 8, "ascii");
  b.writeUInt32LE(10, 16);
  b[20] = exif ? 0x08 : 0; // flags: EXIF metadata present
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return Uint8Array.from(b);
}

/** `solidPng` with an eXIf chunk (orientation 6) between IHDR and IDAT. */
function pngWithExif(width: number, height: number): Uint8Array {
  const png = Buffer.from(solidPng(width, height));
  const tiff = Buffer.from("4d4d002a00000008000101120003000000010006000000000000", "hex");
  const chunk = Buffer.alloc(12 + tiff.length);
  chunk.writeUInt32BE(tiff.length, 0);
  chunk.write("eXIf", 4, "ascii");
  tiff.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + tiff.length)), 8 + tiff.length);
  const afterIhdr = 8 + 25; // signature, then IHDR: length, type, 13 data bytes, CRC
  return Uint8Array.from(Buffer.concat([png.subarray(0, afterIhdr), chunk, png.subarray(afterIhdr)]));
}

describe("checkCompressZip", () => {
  const zipOf = async (names: string[]) => {
    const zip = new JSZip();
    for (const name of names) zip.file(name, "x");
    return zip.generateAsync({ type: "uint8array" });
  };

  it("finds nothing wrong when the zip holds one entry per input", async () => {
    expect(await checkCompressZip(2, undefined, await zipOf(["a.jpg", "b.jpg"]), "quick")).toEqual([]);
  });

  it("flags a zip that lost an entry", async () => {
    expect(properties(await checkCompressZip(3, undefined, await zipOf(["a.jpg", "b.jpg"]), "quick"))).toEqual([
      "zip-entry-count",
    ]);
  });

  it("flags bytes that are not a zip", async () => {
    expect(properties(await checkCompressZip(1, undefined, Uint8Array.from([1, 2, 3]), "quick"))).toEqual([
      "zip-entry-count",
    ]);
  });
});
