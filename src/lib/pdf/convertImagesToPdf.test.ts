import { describe, expect, it, vi } from "vitest";
import { getImageToPdfLabels } from "@/components/tools/image-to-pdf/labels";
import type { Dictionary } from "@/i18n/config";
import en from "@/i18n/dictionaries/en.json";
import ko from "@/i18n/dictionaries/ko.json";
import { getErrorMessage } from "@/lib/errors";
import { convertImagesToPdf, type ImageLayout } from "./assembleSections";
import type { Rotation } from "./pageItem";
import * as check from "./imageToPdfCheck";
import type { Matrix } from "./jpegOrientation";
import {
  JPEG_3x2,
  imagePage as image,
  imageSources as sources,
  withExifOrientation,
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
      expect(getErrorMessage(err, { corruptOutputHint: hint }).message).toBe(hint);
    }
  });
});
