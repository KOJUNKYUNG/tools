import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { getImageToPdfLabels } from "@/components/tools/image-to-pdf/labels";
import type { Dictionary } from "@/i18n/config";
import en from "@/i18n/dictionaries/en.json";
import ko from "@/i18n/dictionaries/ko.json";
import { INVALID_INPUT_PREFIX, getErrorMessage } from "@/lib/errors";
import { inspectPdf } from "@/lib/output-check/pdfInspector";
import sharp from "sharp";
import type { CropRect } from "@/lib/image/maxFitCrop";
import type { PixelSize, PreparedEncoding, SizedImagePreparation } from "@/lib/image/slideImage";
import { nodeSizedPreparation } from "@/lib/image/slideImageNode";
import { readImageHeader } from "@/lib/output-check/imageHeader";
import { pdfJpegs } from "@/lib/output-check/pdfJpegs";
import { convertImagesToPdf } from "./assembleSections";
import type { PageMarginMm, PageOrientation, PagePreset, PageSize } from "./pageSize";
import type { PageItem, Rotation } from "./pageItem";
import * as check from "./imageToPdfCheck";
import type { ImageToPdfRequest } from "./imageToPdfCheck";
import type { Matrix } from "./jpegOrientation";
import {
  JPEG_3x2,
  PNG_KINDS,
  PNG_PAGE_OVERHEAD,
  embeddedJpegs,
  firstPictureRgba,
  noisePng,
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

  it.each<[string, [number, number], [number, number]]>([
    ["past PDF's largest page is held at 200 in (5080 mm)", [90000, 300], [5080, 300]],
    ["under 1 mm is held at 1 mm", [0.2, 300], [300, 1]],
  ])("a custom side %s", async (_, [widthMm, heightMm], expected) => {
    const output = await convertImagesToPdf({
      pages: [image("wide")],
      sourceBytesById: sources(),
      pageSize: { kind: "custom", widthMm, heightMm },
    });
    expect(await pageBoxesMm(output)).toEqual([expected]);
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

type Box = [number, number, number, number];

/** Each page's pictures as pdf.js places them: [x0, y0, x1, y1] in mm. */
async function pictureBoxesMm(pdf: Uint8Array): Promise<Box[][]> {
  return inspectPdf(pdf, async (inspection) => {
    if (inspection.status !== "open") throw new Error(`the PDF does not open: ${inspection.status}`);
    const mm = (pt: number) => pt / PT_PER_MM;
    const pagesBoxes: Box[][] = [];
    for (let n = 1; n <= inspection.pdf.pageCount; n++) {
      const { images } = await inspection.pdf.content(n);
      pagesBoxes.push(images.map(({ box }) => [mm(box.x0), mm(box.y0), mm(box.x1), mm(box.y1)]));
    }
    return pagesBoxes;
  });
}

/** Boxes to within 0.05 mm. */
const near = (pagesBoxes: Box[][]) => pagesBoxes.map((page) => page.map((box) => box.map((v) => expect.closeTo(v, 1))));

describe("convertImagesToPdf: margin", () => {
  it.each<[PageMarginMm, Box, Box]>([
    // wide (2:1) across A4, 297 × 210: the content box is 297 − 2m wide.
    // tall (1:3) up A4, 210 × 297: the content box is 297 − 2m high.
    [0, [0, 30.75, 297, 179.25], [55.5, 0, 154.5, 297]],
    [10, [10, 35.75, 287, 174.25], [58.833, 10, 151.167, 287]],
    [20, [20, 40.75, 277, 169.25], [62.167, 20, 147.833, 277]],
  ])("%i mm: the picture fits whole inside the page less the margin, centred", async (margin, wide, tall) => {
    const output = await convertImagesToPdf({
      pages: [image("wide"), image("tall")],
      sourceBytesById: sources(),
      pageSize: A4,
      margin,
    });
    expect(await pageBoxesMm(output)).toEqual([
      [297, 210],
      [210, 297],
    ]);
    expect(await pictureBoxesMm(output)).toEqual(near([[wide], [tall]]));
  });

  it("holds with a forced orientation and a turned picture", async () => {
    // tall turned across, on a portrait page: shown 3:1 in 190 × 277.
    const output = await convertImagesToPdf({
      pages: [image("tall", 90)],
      sourceBytesById: sources(),
      pageSize: A4,
      orientation: "portrait",
      margin: 10,
    });
    expect(await pictureBoxesMm(output)).toEqual(near([[[10, 116.833, 200, 180.167]]]));
  });

  it("a page too small for the margin keeps half of each side for its picture", async () => {
    // 30 mm square, 20 mm asked: held at 7.5 mm, a quarter of the side.
    const pageSize: PageSize = { kind: "custom", widthMm: 30, heightMm: 30 };
    const src = new Map([["square", solidPng(20, 20)]]);
    const request: ImageToPdfRequest = { pages: [image("square")], pageSize, margin: 20 };
    const output = await convertImagesToPdf({ ...request, sourceBytesById: src });
    expect(await pictureBoxesMm(output)).toEqual(near([[[7.5, 7.5, 22.5, 22.5]]]));
    expect(await checkImageToPdf(src, request, output, "full")).toEqual([]);
  });

  it("image fit ignores the margin: the picture is the page", async () => {
    const output = await convertImagesToPdf({
      pages: [image("wide")],
      sourceBytesById: sources(),
      pageSize: IMAGE_FIT,
      margin: 20,
    });
    const [[w, h]] = await pageBoxesMm(output);
    expect(await pictureBoxesMm(output)).toEqual(near([[[0, 0, w, h]]]));
  });
});

describe("convertImagesToPdf: fill page", () => {
  // wide, tall, a photo shown portrait by its EXIF (6), and tall turned across by the user.
  const mixed = [image("wide"), image("tall"), image("phone"), image("tall", 90)];
  const fill = (pages: PageItem[], settings: Omit<ImageToPdfRequest, "pages">, src = sources()) =>
    convertImagesToPdf({ pages, sourceBytesById: src, ...settings }, undefined, nodeSizedPreparation);

  it.each<[string, PageSize, PageOrientation]>([
    ["A4, auto", A4, "auto"],
    ["A4, portrait", A4, "portrait"],
    ["16:9, auto", { kind: "preset", preset: "16:9" }, "auto"],
    ["16:9, landscape", { kind: "preset", preset: "16:9" }, "landscape"],
    ["custom 100 × 40 mm, auto", CUSTOM_WIDE, "auto"],
    ["custom 100 × 40 mm, portrait", CUSTOM_WIDE, "portrait"],
  ])("%s: every picture covers its whole page, and the output passes the full check", async (_, pageSize, orientation) => {
    const src = sources();
    const settings = { pageSize, orientation, margin: "fill" } as const;
    const output = await fill(mixed, settings, src);
    const pagesMm = await pageBoxesMm(output);
    expect(await pictureBoxesMm(output)).toEqual(near(pagesMm.map(([w, h]) => [[0, 0, w, h]])));
    expect(await checkImageToPdf(src, { pages: mixed, ...settings }, output, "full")).toEqual([]);
  });

  /** The preparation, recording what it is asked to cut. */
  function recording() {
    const calls: { crop: CropRect; size: PixelSize; encoding?: PreparedEncoding }[] = [];
    const preparation: SizedImagePreparation = {
      measure: nodeSizedPreparation.measure,
      prepare(source, crop, size, step, encoding) {
        calls.push({ crop, size, encoding });
        return nodeSizedPreparation.prepare(source, crop, size, step, encoding);
      },
    };
    return { calls, preparation };
  }

  it("asks the preparation for the centre rectangle of the page's shape, kept at its own pixels", async () => {
    const { calls, preparation } = recording();
    await convertImagesToPdf(
      {
        pages: [image("wide"), image("tall", 90), image("phone")],
        sourceBytesById: sources(),
        pageSize: A4,
        margin: "fill",
      },
      undefined,
      preparation,
    );
    expect(calls).toEqual([
      // 40 × 20 on a landscape A4 (√2 : 1): 28 × 20 at the centre.
      { crop: { x: 6, y: 0, width: 28, height: 20 }, size: { width: 28, height: 20 }, encoding: "own" },
      // 10 × 30 turned across: a landscape page, 1 : √2 before the turn.
      { crop: { x: 0, y: 8, width: 10, height: 14 }, size: { width: 10, height: 14 }, encoding: "own" },
      // Shown 2 × 3 (EXIF 6) on a portrait page: 2 × 3 is within a pixel of A4, so it is not cut.
    ]);
  });

  it("puts a picture of the page's shape in whole, as without fill page", async () => {
    const { calls, preparation } = recording();
    const src = new Map([["screen", solidPng(160, 90)]]);
    const pageSize: PageSize = { kind: "preset", preset: "16:9" };
    const output = await convertImagesToPdf(
      { pages: [image("screen")], sourceBytesById: src, pageSize, margin: "fill" },
      undefined,
      preparation,
    );
    expect(calls).toEqual([]);
    expect(await storedPictureSizes(output)).toEqual([[160, 90]]);
  });

  it("keeps the part on the page as it was: a PNG's pixels exactly, the centre of the picture", async () => {
    // Three 10 px bands, red | green | blue: a square page keeps the green one.
    const bands = await sharp(
      Buffer.from(
        Array.from({ length: 10 * 30 }, (_, i) => [[255, 0, 0], [0, 255, 0], [0, 0, 255]][Math.floor((i % 30) / 10)]).flat(),
      ),
      { raw: { width: 30, height: 10, channels: 3 } },
    )
      .png()
      .toBuffer();
    const output = await fill([image("bands")], { pageSize: { kind: "custom", widthMm: 50, heightMm: 50 }, margin: "fill" }, new Map([["bands", new Uint8Array(bands)]]));
    const green = Array.from({ length: 10 * 10 }, () => [0, 255, 0, 255]).flat();
    expect(Array.from(await firstPictureRgba(output))).toEqual(green);
  });

  it("cuts a photo into a JPEG of the part on the page, without its photo info", async () => {
    // 40 × 30 on 16:9: the largest 16:9 rectangle in whole pixels is 39 × 22.
    const photo = withPhotoInfo(new Uint8Array(await sharp(Buffer.from(noisePng(40, 30))).jpeg().toBuffer()));
    const output = await fill([image("photo")], { pageSize: { kind: "preset", preset: "16:9" }, margin: "fill" }, new Map([["photo", photo]]));
    const [jpeg] = await embeddedJpegs(output);
    expect(readImageHeader(jpeg)).toMatchObject({ format: "jpeg", width: 39, height: 22 });
    expect(pdfJpegs(output).map((j) => j.readable && j.reading.photoInfo)).toEqual([[]]);
  });

  it("image fit ignores fill page: each page is its picture, nothing cut", async () => {
    const { calls, preparation } = recording();
    const settings = { pageSize: IMAGE_FIT, margin: "fill" } as const;
    const fitted = await convertImagesToPdf({ pages: mixed, sourceBytesById: sources(), ...settings }, undefined, preparation);
    const plain = await convertImagesToPdf({ pages: mixed, sourceBytesById: sources(), pageSize: IMAGE_FIT });
    expect(calls).toEqual([]);
    expect(await pageBoxesMm(fitted)).toEqual(await pageBoxesMm(plain));
  });
});

/** Each picture's stored size in pixels, page by page, as pdf.js reads it. */
async function storedPictureSizes(pdf: Uint8Array): Promise<[number, number][]> {
  return inspectPdf(pdf, async (inspection) => {
    if (inspection.status !== "open") throw new Error(`the PDF does not open: ${inspection.status}`);
    const sizes: [number, number][] = [];
    for (let n = 1; n <= inspection.pdf.pageCount; n++) {
      for (const { width, height } of (await inspection.pdf.content(n)).images) sizes.push([width, height]);
    }
    return sizes;
  });
}

describe("convertImagesToPdf: orientation", () => {
  // wide, tall, a square, and a tall picture the user turned across.
  const mixed = () => ({
    pages: [image("wide"), image("tall"), image("square"), image("tall", 90)],
    sourceBytesById: new Map([...sources(), ["square", solidPng(20, 20)]]),
  });

  it.each<[string, PageSize, [number, number], [number, number]]>([
    ["A4", A4, [210, 297], [297, 210]],
    ["16:9", { kind: "preset", preset: "16:9" }, [190.5, 338.7], [338.7, 190.5]],
    ["custom 100 × 40 mm", CUSTOM_WIDE, [40, 100], [100, 40]],
  ])("%s: portrait and landscape turn every page that way, whatever its picture", async (_, pageSize, up, across) => {
    const portrait = await convertImagesToPdf({ ...mixed(), pageSize, orientation: "portrait" });
    expect(await pageBoxesMm(portrait)).toEqual([up, up, up, up]);
    const landscape = await convertImagesToPdf({ ...mixed(), pageSize, orientation: "landscape" });
    expect(await pageBoxesMm(landscape)).toEqual([across, across, across, across]);
  });

  it("auto turns each page to its picture as turned in the editor", async () => {
    const output = await convertImagesToPdf({ ...mixed(), pageSize: A4, orientation: "auto" });
    expect(await pageBoxesMm(output)).toEqual([
      [297, 210],
      [210, 297],
      [210, 297],
      [297, 210],
    ]);
  });

  it("image fit ignores the orientation: each page is its picture", async () => {
    const fit = await convertImagesToPdf({ ...mixed(), pageSize: IMAGE_FIT, orientation: "auto" });
    const forced = await convertImagesToPdf({ ...mixed(), pageSize: IMAGE_FIT, orientation: "portrait" });
    expect(await pageBoxesMm(forced)).toEqual(await pageBoxesMm(fit));
  });
});

describe("convertImagesToPdf", () => {
  it.each<[string, Omit<ImageToPdfRequest, "pages">]>([
    ["image fit", { pageSize: IMAGE_FIT }],
    ["image fit, portrait, 20 mm (both ignored)", { pageSize: IMAGE_FIT, orientation: "portrait", margin: 20 }],
    ["A4", { pageSize: A4 }],
    ["A4, portrait, 20 mm", { pageSize: A4, orientation: "portrait", margin: 20 }],
    ["16:9, landscape, 10 mm", { pageSize: { kind: "preset", preset: "16:9" }, orientation: "landscape", margin: 10 }],
    ["custom size", { pageSize: CUSTOM_WIDE }],
    ["custom size, auto, 10 mm", { pageSize: CUSTOM_WIDE, orientation: "auto", margin: 10 }],
  ])("%s: the output passes the full check", async (_, settings) => {
    const src = sources();
    const output = await convertImagesToPdf({ pages, sourceBytesById: src, ...settings });
    expect(await checkImageToPdf(src, { pages, ...settings }, output, "full")).toEqual([]);
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
