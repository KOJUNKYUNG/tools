import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { getImageToPdfLabels } from "@/components/tools/image-to-pdf/labels";
import type { Dictionary } from "@/i18n/config";
import en from "@/i18n/dictionaries/en.json";
import ko from "@/i18n/dictionaries/ko.json";
import { INVALID_INPUT_PREFIX, getErrorMessage } from "@/lib/errors";
import { convertImagesToPdf, type ImageLayout } from "./assembleSections";
import type { Rotation } from "./pageItem";
import * as check from "./imageToPdfCheck";
import type { Matrix } from "./jpegOrientation";
import {
  JPEG_3x2,
  PNG_KINDS,
  PNG_PAGE_OVERHEAD,
  embeddedJpegs,
  firstPictureRgba,
  imagePage as image,
  imageSources as sources,
  asAnimatedPng,
  pngOfKind,
  withDamagedImageData,
  withExifOrientation,
  withImageDataTail,
  withPngHeight,
  withPhotoInfo,
} from "./testImages";

// The real checker by default; one test makes it report a violation.
vi.mock("./imageToPdfCheck", async (importOriginal) => {
  const real = await importOriginal<typeof check>();
  return { ...real, checkImageToPdf: vi.fn(real.checkImageToPdf) };
});
const { checkImageToPdf } = await vi.importActual<typeof check>("./imageToPdfCheck");

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/**
 * Which side of the drawn image the stored top row lands on, as pdfjs (not
 * the engine that wrote it) reads page 1: the transform in force when the
 * image is painted maps image space, whose top row is v = 1.
 */
async function storedTopRowSide(pdf: Uint8Array): Promise<string> {
  const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await lib.getDocument({ data: pdf.slice(), verbosity: 0 }).promise;
  try {
    const page = await doc.getPage(1);
    const { fnArray, argsArray } = await page.getOperatorList();
    let ctm: Matrix = [1, 0, 0, 1, 0, 0];
    const stack: Matrix[] = [];
    for (let i = 0; i < fnArray.length; i++) {
      const op = fnArray[i];
      if (op === lib.OPS.save) stack.push(ctm);
      else if (op === lib.OPS.restore) ctm = stack.pop() ?? ctm;
      // pdfjs passes transform operands as a 6-number array.
      else if (op === lib.OPS.transform) ctm = multiply(ctm, argsArray[i] as Matrix);
      else if (op === lib.OPS.paintImageXObject) break;
    }
    const at = (u: number, v: number) => [
      ctm[0] * u + ctm[2] * v + ctm[4],
      ctm[1] * u + ctm[3] * v + ctm[5],
    ];
    // The drawn image's box on the page, from its four corners.
    const corners = [at(0, 0), at(1, 0), at(0, 1), at(1, 1)];
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const [x, y] = at(0.5, 1); // midpoint of the stored top row
    const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
    if (near(y, Math.max(...ys))) return "top";
    if (near(y, Math.min(...ys))) return "bottom";
    if (near(x, Math.min(...xs))) return "left";
    if (near(x, Math.max(...xs))) return "right";
    return `inside (${x.toFixed(1)}, ${y.toFixed(1)})`;
  } finally {
    await doc.destroy();
  }
}

const pages = [
  image("wide"),
  image("tall", 90),
  image("photo", 180),
  image("wide", 270),
  image("phone"),
  image("phone", 90),
];

describe("convertImagesToPdf", () => {
  it.each<[string, ImageLayout]>([
    ["native layout", { mode: "native" }],
    ["A4", { mode: "fixed", widthPt: 595, heightPt: 842 }],
    ["custom size", { mode: "fixed", widthPt: 300, heightPt: 120 }],
  ])("%s: the output passes the full check", async (_, imageLayout) => {
    const src = sources();
    const output = await convertImagesToPdf({ pages, sourceBytesById: src, imageLayout });
    expect(await checkImageToPdf(src, { pages, imageLayout }, output, "full")).toEqual([]);
  });

  it.each<[string, ImageLayout, string]>([
    ["native layout", { mode: "native" }, "right"],
    ["A4", { mode: "fixed", widthPt: 595, heightPt: 842 }, "right"],
    ["custom landscape size", { mode: "fixed", widthPt: 300, heightPt: 120 }, "right"],
  ])(
    "%s: draws a photo with EXIF orientation 6 as the browser shows it",
    async (_, imageLayout, expectedSide) => {
      // Orientation 6 is shown turned 90° clockwise: the stored top row
      // appears along the right-hand side.
      const output = await convertImagesToPdf({
        pages: [image("phone")],
        sourceBytesById: sources(),
        imageLayout,
      });
      expect(await storedTopRowSide(output)).toBe(expectedSide);
    },
  );

  it.each<[number, ImageLayout, Rotation, string]>([
    [1, { mode: "native" }, 0, "top"],
    [3, { mode: "native" }, 0, "bottom"],
    [8, { mode: "native" }, 0, "left"],
    [2, { mode: "fixed", widthPt: 595, heightPt: 842 }, 0, "top"],
    // Shown with its right side up (6), then turned 90° clockwise by the
    // user on a fixed page, where the turn is drawn: the top row lands below.
    [6, { mode: "fixed", widthPt: 595, heightPt: 842 }, 90, "bottom"],
  ])(
    "orientation %i, %o, turned %i°: the stored top row lands at the %s",
    async (orientation, imageLayout, rotation, expectedSide) => {
      const output = await convertImagesToPdf({
        pages: [image("tagged", rotation)],
        sourceBytesById: new Map([["tagged", withExifOrientation(JPEG_3x2, orientation)]]),
        imageLayout,
      });
      expect(await storedTopRowSide(output)).toBe(expectedSide);
    },
  );

  it.each<[string, ImageLayout]>([
    ["native layout", { mode: "native" }],
    ["A4", { mode: "fixed", widthPt: 595, heightPt: 842 }],
    ["custom size", { mode: "fixed", widthPt: 300, heightPt: 120 }],
  ])("%s: a photo goes in without its photo info, its picture untouched", async (_, imageLayout) => {
    const output = await convertImagesToPdf({
      pages: [image("gps")],
      sourceBytesById: new Map([["gps", withPhotoInfo(JPEG_3x2)]]),
      imageLayout,
    });
    // JPEG_3x2 is the photo with nothing added: same scan data, its JFIF
    // header and colour profile (ICC) still there, nothing re-encoded.
    expect(await embeddedJpegs(output)).toEqual([JPEG_3x2]);
  });

  it("a photo with stray bytes between its segments still goes in, without them", async () => {
    // Some cameras pad between segments; decoders skip such bytes.
    const photo = withPhotoInfo(JPEG_3x2);
    const afterExif = 2 + 2 + ((photo[4] << 8) | photo[5]); // SOI, then the EXIF segment
    const padded = Uint8Array.from([
      ...photo.subarray(0, afterExif),
      0x00,
      0x00,
      ...photo.subarray(afterExif),
    ]);
    const output = await convertImagesToPdf({
      pages: [image("padded")],
      sourceBytesById: new Map([["padded", padded]]),
      imageLayout: { mode: "native" },
    });
    expect(await embeddedJpegs(output)).toEqual([JPEG_3x2]);
  });

  it("a photo with photo info and an EXIF orientation still shows upright", async () => {
    const output = await convertImagesToPdf({
      pages: [image("phone")],
      sourceBytesById: new Map([["phone", withExifOrientation(withPhotoInfo(JPEG_3x2), 6)]]),
      imageLayout: { mode: "native" },
    });
    expect(await storedTopRowSide(output)).toBe("right");
    expect(await embeddedJpegs(output)).toEqual([JPEG_3x2]);
  });

  it.each(PNG_KINDS)("a %s PNG: pdf.js reads back its pixels, transparency included", async (kind) => {
    const png = pngOfKind(kind);
    const output = await convertImagesToPdf({
      pages: [image("png")],
      sourceBytesById: new Map([["png", png.bytes]]),
      imageLayout: { mode: "fixed", widthPt: 595, heightPt: 842 },
    });
    expect(Buffer.from(await firstPictureRgba(output)).equals(Buffer.from(png.rgba))).toBe(true);
  });

  it.each(PNG_KINDS)("a %s PNG: the PDF is no larger than the PNG plus a page's overhead", async (kind) => {
    const png = pngOfKind(kind).bytes;
    const output = await convertImagesToPdf({
      pages: [image("png")],
      sourceBytesById: new Map([["png", png]]),
      imageLayout: { mode: "native" },
    });
    expect(output.byteLength).toBeLessThanOrEqual(png.byteLength + PNG_PAGE_OVERHEAD);
  });

  it("flat-coloured art is no larger than pdf-lib stored it before, without predictors", async () => {
    const png = pngOfKind("flat-coloured art with alpha").bytes;
    const output = await convertImagesToPdf({
      pages: [image("art")],
      sourceBytesById: new Map([["art", png]]),
      imageLayout: { mode: "native" },
    });
    const before = await PDFDocument.create();
    const embedded = await before.embedPng(png);
    before.addPage([embedded.width, embedded.height]).drawImage(embedded);
    expect(output.byteLength).toBeLessThanOrEqual((await before.save()).byteLength);
  });

  it("a PNG whose data holds fewer rows than its header says still shows a picture", async () => {
    const png = withPngHeight(pngOfKind("truecolour").bytes, 80);
    const pagesShort = [image("short")];
    const src = new Map([["short", png]]);
    const imageLayout: ImageLayout = { mode: "native" };
    const output = await convertImagesToPdf({ pages: pagesShort, sourceBytesById: src, imageLayout });
    expect(await checkImageToPdf(src, { pages: pagesShort, imageLayout }, output, "full")).toEqual([]);
    expect((await firstPictureRgba(output)).length).toBe(96 * 80 * 4);
  });

  it.each<[string, (png: Uint8Array) => Uint8Array]>([
    ["its compressed image data damaged", withDamagedImageData],
    ["cut off mid-download", (png) => png.subarray(0, Math.floor(png.length * 0.6))],
  ])("a PNG with %s is refused as a damaged file", async (_, damage) => {
    const err = await convertImagesToPdf({
      pages: [image("png")],
      sourceBytesById: new Map([["png", damage(pngOfKind("truecolour with alpha").bytes)]]),
      imageLayout: { mode: "native" },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    // Narrowed by the assertion above. The user's file, not the tool: the
    // invalid-input error, not the corrupt-output one.
    expect((err as Error).message).toMatch(new RegExp(`^${INVALID_INPUT_PREFIX}`));
  }, 15_000);

  it.each<[string, (png: Uint8Array) => Uint8Array]>([
    ["bytes after the end of its image data", (png) => withImageDataTail(png, Uint8Array.from([1, 2, 3, 4]))],
    ["an animation chunk (shown as its default image)", asAnimatedPng],
  ])("a PNG with %s still goes in, its pixels as a browser shows them", async (_, alter) => {
    const png = pngOfKind("truecolour with alpha");
    const output = await convertImagesToPdf({
      pages: [image("png")],
      sourceBytesById: new Map([["png", alter(png.bytes)]]),
      imageLayout: { mode: "native" },
    });
    expect(Buffer.from(await firstPictureRgba(output)).equals(Buffer.from(png.rgba))).toBe(true);
  }, 15_000);

  it("a browser without compression streams still gets its PNGs in, as pdf-lib embedded them", async () => {
    vi.stubGlobal("DecompressionStream", undefined);
    vi.stubGlobal("CompressionStream", undefined);
    try {
      const png = pngOfKind("truecolour with alpha");
      const output = await convertImagesToPdf({
        pages: [image("png")],
        sourceBytesById: new Map([["png", png.bytes]]),
        imageLayout: { mode: "native" },
      });
      expect(Buffer.from(await firstPictureRgba(output)).equals(Buffer.from(png.rgba))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a JPEG cut off before its picture is refused as a damaged file, not the tool's fault", async () => {
    const scan = Buffer.from(JPEG_3x2).indexOf(Buffer.from([0xff, 0xda]));
    const err = await convertImagesToPdf({
      pages: [image("cut")],
      sourceBytesById: new Map([["cut", JPEG_3x2.subarray(0, scan)]]),
      imageLayout: { mode: "native" },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    // Narrowed by the assertion above.
    expect((err as Error).message).toMatch(new RegExp(`^${INVALID_INPUT_PREFIX}`));
  });

  it("blocks a failing quick check with the corrupt-output error and image-to-pdf's hint", async () => {
    vi.mocked(check.checkImageToPdf).mockResolvedValueOnce([
      { property: "page-count", detail: "1 images → 0 pages" },
    ]);
    const err = await convertImagesToPdf({
      pages: [image("photo")],
      sourceBytesById: sources(),
      imageLayout: { mode: "native" },
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    // Narrowed by the assertion above.
    expect((err as Error).message).toMatch(/^CORRUPT_OUTPUT: image-to-pdf: page-count/);
    // JSON imports are typed by their literal shape; the app reads them as Dictionary.
    for (const dict of [ko, en] as Dictionary[]) {
      const hint = getImageToPdfLabels(dict).errorCorrupt;
      expect(hint).toBeTruthy();
      expect(getErrorMessage(err, { copy: dict.common.errors, corruptOutputHint: hint }).message).toBe(hint);
    }
  });
});
