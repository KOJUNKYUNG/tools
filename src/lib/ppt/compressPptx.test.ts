import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { displayedSize, readImageHeader } from "@/lib/output-check/imageHeader";
import { sameBytes } from "@/lib/output-check/sameBytes";
import { JPEG_3x2, noisePng, solidPng, withExifOrientation, withJpegSize } from "@/lib/pdf/testImages";
import {
  analyzePptxForCompress,
  compressPptxFromBytes,
  type RecompressMedia,
} from "./compressPptx";
import * as check from "./pptCompressCheck";
import type { CompressionPreset } from "@/lib/common/compressionPreset";

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
      // The unused violation would otherwise reach the next test's run.
      vi.mocked(check.checkPptCompress).mockReset();
    });
  });
});

describe("compressPptxFromBytes downsampling", () => {
  interface Shown {
    image: Uint8Array;
    mime: "image/png" | "image/jpeg";
    /** Frame size in inches, on pptxgenjs's 10 in wide slide. */
    w: number;
    h: number;
    cropped?: boolean;
  }

  /** One slide per picture, so slide n's picture is ppt/media/image-n-1.*. */
  async function deck(shown: Shown[]): Promise<Uint8Array> {
    const pptx = new PptxGenJS();
    for (const { image, mime, w, h, cropped } of shown) {
      pptx.addSlide().addImage({
        data: `${mime};base64,${b64(image)}`,
        x: 0,
        y: 0,
        w,
        h,
        ...(cropped && { sizing: { type: "crop", x: 0.5, y: 0, w: w - 0.5, h } }),
      });
    }
    // write() returns a union over every outputType; "uint8array" yields this one.
    return (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
  }

  const slidePicture = (n: number) => new RegExp(`^ppt/media/image-${n}-1\.`);
  const shownPixels = async (out: Uint8Array, n: number) =>
    displayedSize(readImageHeader(await media(out, slidePicture(n)))!);

  /**
   * Stands in for the canvas: a flat image in the input's format, at the
   * action's target size, or at the input's displayed size without one.
   */
  const toTarget: RecompressMedia = async (bytes, action) => {
    const [w, h] = action.target
      ? [action.target.width, action.target.height]
      : displayedSize(readImageHeader(bytes)!);
    return action.kind === "png" ? solidPng(w, h) : withJpegSize(JPEG_3x2, w, h);
  };

  async function run(shown: Shown[], preset: CompressionPreset, recompress = toTarget) {
    const input = await deck(shown);
    const result = await compressPptxFromBytes({ bytes: input, preset, recompress });
    if (result.kind !== "compressed") throw new Error(`got ${result.kind}`);
    expect(await checkPptCompress(input, { preset }, result.data, "full")).toEqual([]);
    return result.data;
  }

  // A 4 × 2 in frame spans 0.4 × 0.2 slide widths.
  const OVERSIZED: Shown = { image: noisePng(1200, 600), mime: "image/png", w: 4, h: 2 };

  it.each([
    ["medium", [1024, 512]],
    ["high", [768, 384]],
  ] as const)("shrinks an oversized picture to its display size at %s", async (preset, size) => {
    expect(await shownPixels(await run([OVERSIZED], preset), 1)).toEqual(size);
  });

  it("keeps every picture's pixel size at low", async () => {
    expect(await shownPixels(await run([OVERSIZED], "low"), 1)).toEqual([1200, 600]);
  });

  it("keeps the pixel size of a picture whose display size is unknown", async () => {
    const out = await run([{ ...OVERSIZED, cropped: true }], "high");
    expect(await shownPixels(out, 1)).toEqual([1200, 600]);
  });

  it("does not resize a picture already near its display size", async () => {
    // 1024 px needed of 1100: too little to gain.
    const out = await run([{ ...OVERSIZED, image: noisePng(1100, 550) }], "medium");
    expect(await shownPixels(out, 1)).toEqual([1100, 550]);
  });

  it("sizes an EXIF-rotated photo as it is displayed", async () => {
    // Stored 3000 × 2000, shown 2000 × 3000 in a 2 × 3 in frame: 512 × 768 at medium.
    const photo = withExifOrientation(withJpegSize(JPEG_3x2, 3000, 2000), 6);
    const out = await run([{ image: photo, mime: "image/jpeg", w: 2, h: 3 }], "medium");
    expect(await shownPixels(out, 1)).toEqual([512, 768]);
  });

  it.each([
    ["distorts it", (w: number, h: number) => solidPng(w, h + 50)],
    ["enlarges it", (w: number, h: number) => solidPng(w * 2, h * 2)],
  ])("keeps a picture's original bytes when resizing it %s", async (_, resized) => {
    // A second, small picture still shrinks, so a deck comes back.
    const small: Shown = { image: noisePng(40, 20), mime: "image/png", w: 10, h: 5 };
    const out = await run([OVERSIZED, small], "high", async (bytes, action) =>
      action.target ? resized(action.target.width, action.target.height) : toTarget(bytes, action),
    );
    expect(sameBytes(await media(out, slidePicture(1)), OVERSIZED.image)).toBe(true);
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
        return bytes.length > 0 ? { colors: 1234, opaque: true, visible: 600 } : null;
      },
    );
    const png = analysis.media.find((m) => m.kind === "png");
    const jpeg = analysis.media.find((m) => m.kind === "jpeg");
    // noisePng is RGB: no alpha channel to drop, however opaque the pixels
    expect(png).toMatchObject({ palette: false, colors: 1234, unusedAlpha: false });
    // the pixels the canvas found not fully transparent
    expect(png).toMatchObject({ visiblePixels: 600 });
    expect(png?.bytes).toBe((await media(deck, PNG_MEDIA)).length);
    expect(jpeg).toMatchObject({ bytes: (await media(deck, JPEG_MEDIA)).length });
    expect(jpeg?.kind === "jpeg" && jpeg.quality).toBeGreaterThan(0);
    // Counted just past the weakest preset's budget (4096 * 0.82).
    expect(counted).toEqual([3359]);
  });
  it("takes every pixel as visible when a PNG cannot be decoded", async () => {
    const deck = await syntheticDeck();
    const analysis = await analyzePptxForCompress(
      new File([new Uint8Array(deck)], "deck.pptx"),
      async () => null,
    );
    // 40 × 20 from its header: the estimate then promises the least
    expect(analysis.media.find((m) => m.kind === "png")).toMatchObject({ visiblePixels: 800 });
  });
});
