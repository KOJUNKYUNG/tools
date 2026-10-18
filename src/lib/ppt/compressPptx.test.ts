import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { JPEG_3x2, noisePng, solidPng, withExifOrientation } from "@/lib/pdf/testImages";
import {
  analyzePptxForCompress,
  compressPptxFromBytes,
  type RecompressMedia,
} from "./compressPptx";
import * as check from "./pptCompressCheck";

// The real checker by default; one test makes it report a violation.
vi.mock("./pptCompressCheck", async (importOriginal) => {
  const real = await importOriginal<typeof check>();
  return { ...real, checkPptCompress: vi.fn(real.checkPptCompress) };
});
const { checkPptCompress } = await vi.importActual<typeof check>("./pptCompressCheck");

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

// Stored 3×2, shown 2×3, as a phone photo.
const PHOTO = withExifOrientation(JPEG_3x2, 6);

/** A 2-slide deck: a noisy 40×20 PNG, then a phone photo. */
async function syntheticDeck(): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx
    .addSlide()
    .addImage({ data: `image/png;base64,${b64(noisePng(40, 20))}`, x: 1, y: 1, w: 4, h: 2 });
  pptx
    .addSlide()
    .addImage({ data: `image/jpeg;base64,${b64(PHOTO)}`, x: 1, y: 1, w: 2, h: 3 });
  // write() returns a union over every outputType; "uint8array" yields this one.
  return (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
}

async function media(deck: Uint8Array, pattern: RegExp): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(deck);
  const entry = zip.file(pattern)[0];
  if (!entry) throw new Error(`no media matching ${pattern}`);
  return entry.async("uint8array");
}

const PNG_MEDIA = /^ppt\/media\/.*\.png$/;
const JPEG_MEDIA = /^ppt\/media\/.*\.jpe?g$/;

/** Stands in for the canvas: a flat PNG of the same size, the JPEG as given. */
const shrinkPng =
  (jpeg: (bytes: Uint8Array) => Uint8Array): RecompressMedia =>
  async (bytes, action) =>
    action.kind === "png" ? solidPng(40, 20) : jpeg(bytes);

describe("compressPptxFromBytes", () => {
  it("returns a compressed deck that passes the full check", async () => {
    const deck = await syntheticDeck();
    const result = await compressPptxFromBytes({
      bytes: deck,
      preset: "medium",
      recompress: shrinkPng((b) => b),
    });
    if (result.kind !== "compressed") throw new Error(`got ${result.kind}`);
    expect(result.compressedSize).toBe(result.data.byteLength);
    expect(result.compressedSize).toBeLessThan(result.originalSize);
    expect(await media(result.data, PNG_MEDIA)).toEqual(solidPng(40, 20));
    expect(await checkPptCompress(deck, { preset: "medium" }, result.data, "full")).toEqual([]);
  });

  it.each([
    ["changes its displayed size", () => JPEG_3x2],
    ["changes its format", () => solidPng(2, 3)],
    ["fails", (): Uint8Array => {
      throw new Error("canvas failed");
    }],
  ])("keeps an image's original bytes when recompressing it %s", async (_, jpeg) => {
    const deck = await syntheticDeck();
    const result = await compressPptxFromBytes({
      bytes: deck,
      preset: "medium",
      recompress: shrinkPng(jpeg),
    });
    if (result.kind !== "compressed") throw new Error(`got ${result.kind}`);
    expect(await media(result.data, JPEG_MEDIA)).toEqual(PHOTO);
    expect(await checkPptCompress(deck, { preset: "medium" }, result.data, "full")).toEqual([]);
  });

  describe("on a deck it could not shrink", () => {
    // Packed as tightly as the engine packs, so repackaging alone cannot shrink it.
    const tightDeck = async () =>
      (await JSZip.loadAsync(await syntheticDeck())).generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: { level: 9 },
      });

    it("reports it without handing back a file", async () => {
      const deck = await tightDeck();
      const result = await compressPptxFromBytes({
        bytes: deck,
        preset: "high",
        // Valid re-encodes that come out no smaller: a stronger preset may help.
        recompress: async (bytes) => bytes,
      });
      expect(result).toEqual({
        kind: "not-smaller",
        originalSize: deck.byteLength,
        compressedSize: expect.any(Number),
        anyImageReencoded: true,
      });
      if (result.kind !== "not-smaller") throw new Error("unreachable");
      expect(result.compressedSize).toBeGreaterThanOrEqual(result.originalSize);
    });

    it("says when no image could be re-encoded, so no preset can help", async () => {
      const result = await compressPptxFromBytes({
        bytes: await tightDeck(),
        preset: "low",
        // Wrong format for the PNG, wrong shape for the photo: both are kept.
        recompress: async () => JPEG_3x2,
      });
      expect(result).toMatchObject({ kind: "not-smaller", anyImageReencoded: false });
    });

    it("skips the damage check, since no file is offered either way", async () => {
      vi.mocked(check.checkPptCompress).mockClear();
      vi.mocked(check.checkPptCompress).mockResolvedValueOnce([
        { property: "slide-count", detail: "2 → 1 slides" },
      ]);
      const result = await compressPptxFromBytes({
        bytes: await tightDeck(),
        preset: "high",
        recompress: async (bytes) => bytes,
      });
      expect(result).toMatchObject({ kind: "not-smaller" });
      expect(vi.mocked(check.checkPptCompress)).not.toHaveBeenCalled();
    });
  });
});

describe("analyzePptxForCompress", () => {
  it("reads each image's size and signs of earlier compression", async () => {
    const deck = await syntheticDeck();
    const counted: number[] = [];
    const analysis = await analyzePptxForCompress(
      new File([new Uint8Array(deck)], "deck.pptx"),
      async (bytes, cap) => {
        counted.push(cap);
        return bytes.length > 0 ? { colors: 1234, opaque: true } : null;
      },
    );
    const png = analysis.media.find((m) => m.kind === "png");
    const jpeg = analysis.media.find((m) => m.kind === "jpeg");
    // noisePng is RGB: no alpha channel to drop, however opaque the pixels
    expect(png).toMatchObject({ palette: false, colors: 1234, unusedAlpha: false });
    expect(png?.bytes).toBe((await media(deck, PNG_MEDIA)).length);
    expect(jpeg).toMatchObject({ bytes: (await media(deck, JPEG_MEDIA)).length });
    expect(jpeg?.kind === "jpeg" && jpeg.quality).toBeGreaterThan(0);
    // Counted just past the weakest preset's budget (4096 * 0.82).
    expect(counted).toEqual([3359]);
  });
});
