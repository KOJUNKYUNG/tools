import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { getImageToPdfLabels } from "@/components/tools/image-to-pdf/labels";
import type { Dictionary } from "@/i18n/config";
import en from "@/i18n/dictionaries/en.json";
import ko from "@/i18n/dictionaries/ko.json";
import { INVALID_INPUT_PREFIX, getErrorMessage } from "@/lib/errors";
import { convertImagesToPdf } from "./assembleSections";
import type { PagePreset, PageSize } from "./pageSize";
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
  solidPng,
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

const PT_PER_MM = 72 / 25.4;
const IMAGE_FIT: PageSize = { kind: "image-fit" };
const A4: PageSize = { kind: "preset", preset: "a4" };
const CUSTOM_WIDE: PageSize = { kind: "custom", widthMm: 100, heightMm: 40 };

/** Each page's box in millimetres, as pdf.js reads it, to 0.1 mm. */
async function pageBoxesMm(pdf: Uint8Array): Promise<[number, number][]> {
  const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await lib.getDocument({ data: pdf.slice(), verbosity: 0 }).promise;
  try {
    const boxes: [number, number][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const [x0, y0, x1, y1] = (await doc.getPage(n)).view;
      const mm = (pt: number) => Math.round((pt / PT_PER_MM) * 10) / 10;
      boxes.push([mm(x1 - x0), mm(y1 - y0)]);
    }
    return boxes;
  } finally {
    await doc.destroy();
  }
}

describe("convertImagesToPdf: page size", () => {
  it("a landscape picture on A4 gets a 297 × 210 mm page", async () => {
    const pageSize: PageSize = { kind: "preset", preset: "a4" };
    const output = await convertImagesToPdf({ pages: [image("wide")], sourceBytesById: sources(), pageSize });
    expect(await pageBoxesMm(output)).toEqual([[297, 210]]);
  });

  // Sizes from the spec (#176): paper in mm, screens in inches (PowerPoint's
  // default slides: 13.333 × 7.5 in = 338.7 × 190.5 mm, 10 × 7.5 in).
  it.each<[PagePreset, [number, number]]>([
    ["a3", [297, 420]],
    ["a4", [210, 297]],
    ["a5", [148, 210]],
    ["b4", [257, 364]],
    ["b5", [182, 257]],
    ["letter", [215.9, 279.4]],
    ["16:9", [190.5, 338.7]],
    ["4:3", [190.5, 254]],
  ])("%s: a portrait picture gets a portrait page, a landscape one a landscape page", async (preset, [short, long]) => {
    const output = await convertImagesToPdf({
      pages: [image("tall"), image("wide")],
      sourceBytesById: sources(),
      pageSize: { kind: "preset", preset },
    });
    expect(await pageBoxesMm(output)).toEqual([
      [short, long],
      [long, short],
    ]);
  });

  it("a picture turned in the editor gets the page orientation of its turned shape", async () => {
    // "phone" is stored 3×2 and shown 2×3 (EXIF 6): portrait until the user turns it.
    const output = await convertImagesToPdf({
      pages: [image("tall", 90), image("wide", 270), image("phone"), image("phone", 90), image("tall", 180)],
      sourceBytesById: sources(),
      pageSize: A4,
    });
    expect(await pageBoxesMm(output)).toEqual([
      [297, 210],
      [210, 297],
      [210, 297],
      [297, 210],
      [210, 297],
    ]);
  });

  it("custom millimetres give pages of that size, turned to the picture", async () => {
    const output = await convertImagesToPdf({
      pages: [image("wide"), image("tall")],
      sourceBytesById: sources(),
      pageSize: { kind: "custom", widthMm: 100, heightMm: 40 },
    });
    expect(await pageBoxesMm(output)).toEqual([
      [100, 40],
      [40, 100],
    ]);
  });

  it("a custom size past PDF's largest page is held at 200 in (5080 mm)", async () => {
    const output = await convertImagesToPdf({
      pages: [image("wide")],
      sourceBytesById: sources(),
      pageSize: { kind: "custom", widthMm: 90000, heightMm: 300 },
    });
    expect(await pageBoxesMm(output)).toEqual([[5080, 300]]);
  });

  it("a square picture keeps the preset as listed: paper portrait, screens landscape", async () => {
    const src = new Map([["square", solidPng(20, 20)]]);
    const boxes = async (preset: PagePreset) =>
      pageBoxesMm(
        await convertImagesToPdf({ pages: [image("square")], sourceBytesById: src, pageSize: { kind: "preset", preset } }),
      );
    expect(await boxes("a4")).toEqual([[210, 297]]);
    expect(await boxes("16:9")).toEqual([[338.7, 190.5]]);
  });
});

describe("convertImagesToPdf", () => {
  it.each<[string, PageSize]>([
    ["image fit", IMAGE_FIT],
    ["A4", A4],
    ["custom size", CUSTOM_WIDE],
  ])("%s: the output passes the full check", async (_, pageSize) => {
    const src = sources();
    const output = await convertImagesToPdf({ pages, sourceBytesById: src, pageSize });
    expect(await checkImageToPdf(src, { pages, pageSize }, output, "full")).toEqual([]);
  });

  it.each<[string, PageSize, string]>([
    ["image fit", IMAGE_FIT, "right"],
    ["A4", A4, "right"],
    ["custom landscape size", CUSTOM_WIDE, "right"],
  ])(
    "%s: draws a photo with EXIF orientation 6 as the browser shows it",
    async (_, pageSize, expectedSide) => {
      // Orientation 6 is shown turned 90° clockwise: the stored top row
      // appears along the right-hand side.
      const output = await convertImagesToPdf({
        pages: [image("phone")],
        sourceBytesById: sources(),
        pageSize,
      });
      expect(await storedTopRowSide(output)).toBe(expectedSide);
    },
  );

  it.each<[number, PageSize, Rotation, string]>([
    [1, IMAGE_FIT, 0, "top"],
    [3, IMAGE_FIT, 0, "bottom"],
    [8, IMAGE_FIT, 0, "left"],
    [2, A4, 0, "top"],
    // Shown with its right side up (6), then turned 90° clockwise by the
    // user on a fixed page, where the turn is drawn: the top row lands below.
    [6, A4, 90, "bottom"],
  ])(
    "orientation %i, %o, turned %i°: the stored top row lands at the %s",
    async (orientation, pageSize, rotation, expectedSide) => {
      const output = await convertImagesToPdf({
        pages: [image("tagged", rotation)],
        sourceBytesById: new Map([["tagged", withExifOrientation(JPEG_3x2, orientation)]]),
        pageSize,
      });
      expect(await storedTopRowSide(output)).toBe(expectedSide);
    },
  );

  it.each<[string, PageSize]>([
    ["image fit", IMAGE_FIT],
    ["A4", A4],
    ["custom size", CUSTOM_WIDE],
  ])("%s: a photo goes in without its photo info, its picture untouched", async (_, pageSize) => {
    const output = await convertImagesToPdf({
      pages: [image("gps")],
      sourceBytesById: new Map([["gps", withPhotoInfo(JPEG_3x2)]]),
      pageSize,
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
      pageSize: IMAGE_FIT,
    });
    expect(await embeddedJpegs(output)).toEqual([JPEG_3x2]);
  });

  it("a photo with photo info and an EXIF orientation still shows upright", async () => {
    const output = await convertImagesToPdf({
      pages: [image("phone")],
      sourceBytesById: new Map([["phone", withExifOrientation(withPhotoInfo(JPEG_3x2), 6)]]),
      pageSize: IMAGE_FIT,
    });
    expect(await storedTopRowSide(output)).toBe("right");
    expect(await embeddedJpegs(output)).toEqual([JPEG_3x2]);
  });

  it.each(PNG_KINDS)("a %s PNG: pdf.js reads back its pixels, transparency included", async (kind) => {
    const png = pngOfKind(kind);
    const output = await convertImagesToPdf({
      pages: [image("png")],
      sourceBytesById: new Map([["png", png.bytes]]),
      pageSize: A4,
    });
    expect(Buffer.from(await firstPictureRgba(output)).equals(Buffer.from(png.rgba))).toBe(true);
  });

  it.each(PNG_KINDS)("a %s PNG: the PDF is no larger than the PNG plus a page's overhead", async (kind) => {
    const png = pngOfKind(kind).bytes;
    const output = await convertImagesToPdf({
      pages: [image("png")],
      sourceBytesById: new Map([["png", png]]),
      pageSize: IMAGE_FIT,
    });
    expect(output.byteLength).toBeLessThanOrEqual(png.byteLength + PNG_PAGE_OVERHEAD);
  });

  it("flat-coloured art is no larger than pdf-lib stored it before, without predictors", async () => {
    const png = pngOfKind("flat-coloured art with alpha").bytes;
    const output = await convertImagesToPdf({
      pages: [image("art")],
      sourceBytesById: new Map([["art", png]]),
      pageSize: IMAGE_FIT,
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
    const pageSize: PageSize = IMAGE_FIT;
    const output = await convertImagesToPdf({ pages: pagesShort, sourceBytesById: src, pageSize });
    expect(await checkImageToPdf(src, { pages: pagesShort, pageSize }, output, "full")).toEqual([]);
    expect((await firstPictureRgba(output)).length).toBe(96 * 80 * 4);
  });

  it.each<[string, (png: Uint8Array) => Uint8Array]>([
    ["its compressed image data damaged", withDamagedImageData],
    ["cut off mid-download", (png) => png.subarray(0, Math.floor(png.length * 0.6))],
  ])("a PNG with %s is refused as a damaged file", async (_, damage) => {
    const err = await convertImagesToPdf({
      pages: [image("png")],
      sourceBytesById: new Map([["png", damage(pngOfKind("truecolour with alpha").bytes)]]),
      pageSize: IMAGE_FIT,
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
      pageSize: IMAGE_FIT,
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
        pageSize: IMAGE_FIT,
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
      pageSize: IMAGE_FIT,
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
      pageSize: IMAGE_FIT,
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
