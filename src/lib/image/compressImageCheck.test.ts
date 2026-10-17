import JSZip from "jszip";
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
