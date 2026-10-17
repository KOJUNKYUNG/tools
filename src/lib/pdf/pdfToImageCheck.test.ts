import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkPageImage, type RenderedPage } from "./pdfToImageCheck";
import { JPEG_3x2, solidPng, stubBrowserDecoder } from "./testImages";

const blob = (bytes: Uint8Array) => new Blob([bytes.slice()]);

const page = (bytes: Uint8Array | null, width: number, height: number): RenderedPage => ({
  blob: bytes && blob(bytes),
  width,
  height,
});

const properties = async (output: RenderedPage, format: "image/png" | "image/jpeg" = "image/png") =>
  (await checkPageImage(3, { format }, output, "quick")).map((v) => v.property);

describe("checkPageImage", () => {
  beforeEach(stubBrowserDecoder);
  afterEach(() => vi.unstubAllGlobals());

  it("passes an image of the requested format at the planned size", async () => {
    expect(await properties(page(solidPng(40, 30), 40, 30))).toEqual([]);
    expect(await properties(page(JPEG_3x2, 3, 2), "image/jpeg")).toEqual([]);
  });

  it("flags a page that produced no image", async () => {
    expect(await properties(page(null, 40, 30))).toEqual(["page-image"]);
    expect(await properties(page(new Uint8Array(0), 40, 30))).toEqual(["page-image"]);
  });

  it("flags an image at a size other than planned", async () => {
    expect(await properties(page(solidPng(40, 29), 40, 30))).toEqual(["image-size"]);
  });

  it("flags an image in another format than requested", async () => {
    // Canvas falls back to PNG for a type it cannot encode.
    expect(await properties(page(solidPng(3, 2), 3, 2), "image/jpeg")).toEqual(["image-format"]);
  });

  it("flags bytes that are not an image", async () => {
    const garbage = new TextEncoder().encode("not an image at all");
    expect(await properties(page(garbage, 40, 30))).toEqual(["image-format", "image-decodes"]);
  });

  it("flags an image the browser cannot decode", async () => {
    vi.stubGlobal("createImageBitmap", async () => {
      throw new DOMException("The source image could not be decoded.", "InvalidStateError");
    });
    expect(await properties(page(solidPng(40, 30), 40, 30))).toEqual(["image-decodes"]);
  });

  it("names the page in the detail", async () => {
    const [violation] = await checkPageImage(3, { format: "image/png" }, page(null, 1, 1), "quick");
    expect(violation.detail).toMatch(/page 3/);
  });
});
