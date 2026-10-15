import { randomBytes } from "node:crypto";
import { PDFDocument, degrees } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { ImageLayout } from "./assembleSections";
import { checkImageToPdf } from "./imageToPdfCheck";
import type { PageItem, Rotation } from "./pageItem";
import { JPEG_3x2, solidPng as png } from "./testImages";

const sources = () =>
  new Map([
    ["wide", png(40, 20)],
    ["tall", png(10, 30)],
    ["photo", JPEG_3x2],
  ]);

function image(sourceFileId: string, rotation: Rotation = 0): PageItem {
  return {
    id: sourceFileId,
    sourceFileId,
    sourceFileName: `${sourceFileId}.png`,
    kind: "image",
    sourcePageIndex: 0,
    rotation,
    splitAfter: false,
    deleted: false,
  };
}

interface PageSpec {
  /** Which source image the page shows; null for a page without one. */
  source: string | null;
  size: [number, number];
  rotation?: number;
}

/** Draw pages by hand (not through the engine): each shows its image. */
async function pdfOf(pages: PageSpec[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const src = sources();
  for (const { source, size, rotation = 0 } of pages) {
    const page = doc.addPage(size);
    if (source !== null) {
      const bytes = src.get(source)!; // test data: every named source exists
      const img = source === "photo" ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
      page.drawImage(img, { x: 0, y: 0, width: size[0], height: size[1] });
    }
    if (rotation) page.setRotation(degrees(rotation));
  }
  return doc.save();
}

const NATIVE: ImageLayout = { mode: "native" };
const A4: ImageLayout = { mode: "fixed", widthPt: 595, heightPt: 842 };
const props = (vs: { property: string }[]) => vs.map((v) => v.property);

describe("checkImageToPdf: good outputs", () => {
  it("native layout: each page is its image's size, turned as requested", async () => {
    const pages = [image("wide"), image("tall", 90), image("photo")];
    const out = await pdfOf([
      { source: "wide", size: [40, 20] },
      { source: "tall", size: [10, 30], rotation: 90 },
      { source: "photo", size: [3, 2] },
    ]);
    expect(await checkImageToPdf(sources(), { pages, layout: NATIVE }, out, "full")).toEqual([]);
  });

  it("fixed layout: every page has the chosen size, unturned", async () => {
    // The turn is drawn into the page, so the page itself stays upright.
    const pages = [image("wide"), image("tall", 270)];
    const out = await pdfOf([
      { source: "wide", size: [595, 842] },
      { source: "tall", size: [595, 842] },
    ]);
    expect(await checkImageToPdf(sources(), { pages, layout: A4 }, out, "full")).toEqual([]);
  });
});

describe("checkImageToPdf: broken outputs", () => {
  const pages = [image("wide"), image("tall")];

  it("flags a missing page at quick depth", async () => {
    const out = await pdfOf([{ source: "wide", size: [40, 20] }]);
    expect(props(await checkImageToPdf(sources(), { pages, layout: NATIVE }, out, "quick"))).toEqual([
      "page-count",
    ]);
  });

  it("flags unopenable bytes at quick depth", async () => {
    const out = new TextEncoder().encode("%PDF-1.7 truncated");
    expect(props(await checkImageToPdf(sources(), { pages, layout: NATIVE }, out, "quick"))).toEqual([
      "pdf-opens",
    ]);
  });

  it("flags a first page that does not render at quick depth", async () => {
    const doc = await PDFDocument.load(
      await pdfOf([
        { source: "wide", size: [40, 20] },
        { source: "tall", size: [10, 30] },
      ]),
    );
    doc.catalog.Pages().Kids().set(0, doc.context.nextRef());
    const vs = await checkImageToPdf(sources(), { pages, layout: NATIVE }, await doc.save(), "quick");
    expect(props(vs)).toContain("first-page-renders");
  });

  it("flags a native page that is not its image's size, at full depth only", async () => {
    const out = await pdfOf([
      { source: "wide", size: [40, 20] },
      { source: "tall", size: [30, 10] },
    ]);
    const src = sources();
    expect(await checkImageToPdf(src, { pages, layout: NATIVE }, out, "quick")).toEqual([]);
    expect(await checkImageToPdf(src, { pages, layout: NATIVE }, out, "full")).toEqual([
      { property: "page-size", detail: "page 2: 30×10 pt, expected 10×30" },
    ]);
  });

  it("flags a native page whose turn was not applied", async () => {
    const out = await pdfOf([
      { source: "wide", size: [40, 20] },
      { source: "tall", size: [10, 30] },
    ]);
    const turned = [image("wide"), image("tall", 90)];
    expect(props(await checkImageToPdf(sources(), { pages: turned, layout: NATIVE }, out, "full"))).toEqual([
      "page-rotation",
    ]);
  });

  it("flags a fixed-layout page of the wrong size", async () => {
    const out = await pdfOf([
      { source: "wide", size: [595, 842] },
      { source: "tall", size: [40, 20] },
    ]);
    expect(props(await checkImageToPdf(sources(), { pages, layout: A4 }, out, "full"))).toEqual([
      "page-size",
    ]);
  });

  it("flags a fixed-layout page turned instead of drawn turned", async () => {
    const out = await pdfOf([
      { source: "wide", size: [595, 842] },
      { source: "tall", size: [595, 842], rotation: 90 },
    ]);
    expect(props(await checkImageToPdf(sources(), { pages, layout: A4 }, out, "full"))).toEqual([
      "page-rotation",
    ]);
  });

  it("flags a page that shows no image", async () => {
    const out = await pdfOf([
      { source: "wide", size: [40, 20] },
      { source: null, size: [10, 30] },
    ]);
    expect(props(await checkImageToPdf(sources(), { pages, layout: NATIVE }, out, "full"))).toEqual([
      "page-image",
    ]);
  });

  it("flags an output far larger than its images", async () => {
    const doc = await PDFDocument.load(await pdfOf([{ source: "photo", size: [3, 2] }]));
    // Random bytes do not compress, so the file really grows by 200 KB.
    await doc.attach(randomBytes(200_000), "padding.bin");
    const vs = await checkImageToPdf(
      sources(),
      { pages: [image("photo")], layout: NATIVE },
      await doc.save(),
      "full",
    );
    expect(props(vs)).toEqual(["size-bound"]);
  });

  it("keeps the caller's output bytes intact", async () => {
    const out = await pdfOf([{ source: "photo", size: [3, 2] }]);
    const copy = out.slice();
    await checkImageToPdf(sources(), { pages: [image("photo")], layout: NATIVE }, out, "full");
    expect(out).toEqual(copy);
  });
});
