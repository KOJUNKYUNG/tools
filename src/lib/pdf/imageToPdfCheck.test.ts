import { randomBytes } from "node:crypto";
import { PDFDocument, degrees } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { type ImageToPdfRequest, checkImageToPdf } from "./imageToPdfCheck";
import type { PageSize } from "./pageSize";
import {
  JPEG_3x2,
  imagePage as image,
  imageSources as sources,
  solidPng,
  withExifOrientation,
  withPhotoInfo,
} from "./testImages";

interface PageSpec {
  /** Which source image the page shows; null for a page without one. */
  source: string | null;
  size: [number, number];
  rotation?: number;
  /** Where the picture is drawn, [x, y, width, height]; the whole page by default. */
  draw?: [number, number, number, number];
  /** The picture drawn turned a quarter clockwise about its anchor (x, y), as the engine draws a user's turn. */
  quarterTurned?: boolean;
  /** The picture stored, when not the source itself (a part cut under fill page). */
  stored?: Uint8Array;
}

/**
 * Draw pages by hand (not through the engine): each shows its image. A JPEG
 * goes in as the engine embeds it, without its EXIF: both test photos are
 * JPEG_3x2 with an EXIF segment added.
 */
async function pdfOf(pages: PageSpec[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const src = sources();
  for (const { source, size, rotation = 0, draw = [0, 0, ...size], quarterTurned, stored } of pages) {
    const page = doc.addPage(size);
    if (source !== null) {
      const bytes = src.get(source)!; // test data: every named source exists
      const isJpeg = !stored && (source === "photo" || source === "phone");
      const img = isJpeg ? await doc.embedJpg(JPEG_3x2) : await doc.embedPng(stored ?? bytes);
      const [x, y, width, height] = draw;
      page.drawImage(img, { x, y, width, height, rotate: quarterTurned ? degrees(-90) : undefined });
    }
    if (rotation) page.setRotation(degrees(rotation));
  }
  return doc.save();
}

const IMAGE_FIT: PageSize = { kind: "image-fit" };
const A4: PageSize = { kind: "preset", preset: "a4" };
// A4 in points, as listed (portrait) and turned (landscape).
const A4_UP: [number, number] = [595.2756, 841.8898];
const A4_ACROSS: [number, number] = [841.8898, 595.2756];
const props = (vs: { property: string }[]) => vs.map((v) => v.property);

describe("checkImageToPdf: good outputs", () => {
  it("image fit: each page is its image's size, turned as requested", async () => {
    const pages = [image("wide"), image("tall", 90), image("photo")];
    const out = await pdfOf([
      { source: "wide", size: [40, 20] },
      { source: "tall", size: [10, 30], rotation: 90 },
      { source: "photo", size: [3, 2] },
    ]);
    expect(await checkImageToPdf(sources(), { pages, pageSize: IMAGE_FIT }, out, "full")).toEqual([]);
  });

  it("image fit: a photo with EXIF orientation gets its displayed size", async () => {
    // Stored 3×2, shown 2×3: the PDF page must match what the user sees.
    const out = await pdfOf([{ source: "phone", size: [2, 3] }]);
    expect(
      await checkImageToPdf(sources(), { pages: [image("phone")], pageSize: IMAGE_FIT }, out, "full"),
    ).toEqual([]);
  });

  it("preset: each page has the preset's size turned to its picture, the picture whole and fitted", async () => {
    // wide 40×20 across A4: 841.9 × 420.9, centred; tall 10×30 up A4: 280.6 × 841.9.
    const pages = [image("wide"), image("tall")];
    const out = await pdfOf([
      { source: "wide", size: A4_ACROSS, draw: [0, 87.17, 841.8898, 420.9449] },
      { source: "tall", size: A4_UP, draw: [157.32, 0, 280.6299, 841.8898] },
    ]);
    expect(await checkImageToPdf(sources(), { pages, pageSize: A4 }, out, "full")).toEqual([]);
  });

  it("custom: each page has the millimetres given, turned to its picture", async () => {
    // 100 × 40 mm = 283.46 × 113.39 pt.
    const pages = [image("wide"), image("tall")];
    const out = await pdfOf([
      { source: "wide", size: [283.4646, 113.3858], draw: [28.35, 0, 226.7717, 113.3858] },
      { source: "tall", size: [113.3858, 283.4646], draw: [9.45, 0, 94.4882, 283.4646] },
    ]);
    const pageSize: PageSize = { kind: "custom", widthMm: 100, heightMm: 40 };
    expect(await checkImageToPdf(sources(), { pages, pageSize }, out, "full")).toEqual([]);
  });
});

describe("checkImageToPdf: orientation", () => {
  // wide 40×20 up A4: 595.3 × 297.6, centred.
  const widePortrait = () =>
    pdfOf([{ source: "wide", size: A4_UP, draw: [0, 272.126, 595.2756, 297.6378] }]);

  it("passes a page turned the way the request forces", async () => {
    const vs = await checkImageToPdf(
      sources(),
      { pages: [image("wide")], pageSize: A4, orientation: "portrait" },
      await widePortrait(),
      "full",
    );
    expect(vs).toEqual([]);
  });

  it.each(["auto", "landscape"] as const)("flags a portrait page when the request asks %s", async (orientation) => {
    const vs = await checkImageToPdf(
      sources(),
      { pages: [image("wide")], pageSize: A4, orientation },
      await widePortrait(),
      "full",
    );
    expect(props(vs)).toContain("page-size");
  });
});

describe("checkImageToPdf: margin", () => {
  // wide 40×20 across A4 less 10 mm (28.35 pt) a side: 785.2 × 392.6, centred.
  const request: ImageToPdfRequest = { pages: [image("wide")], pageSize: A4, margin: 10 };

  it("passes a picture fitted inside the page less the margin", async () => {
    const out = await pdfOf([{ source: "wide", size: A4_ACROSS, draw: [28.3465, 101.3386, 785.1969, 392.5984] }]);
    expect(await checkImageToPdf(sources(), request, out, "full")).toEqual([]);
  });

  it("flags a picture drawn into the margin", async () => {
    const out = await pdfOf([{ source: "wide", size: A4_ACROSS, draw: [0, 87.17, 841.8898, 420.9449] }]);
    expect(props(await checkImageToPdf(sources(), request, out, "full"))).toEqual(["picture-fit"]);
  });

  it("flags a picture left smaller than the content box", async () => {
    const out = await pdfOf([{ source: "wide", size: A4_ACROSS, draw: [56.69, 115.51, 728.5, 364.25] }]);
    expect(props(await checkImageToPdf(sources(), request, out, "full"))).toEqual(["picture-fit"]);
  });
});

describe("checkImageToPdf: fill page", () => {
  // wide 40×20 on a landscape A4: its centre 28×20 covers the page.
  const request: ImageToPdfRequest = { pages: [image("wide")], pageSize: A4, margin: "fill" };
  const cut = solidPng(28, 20);
  const fitDetails = (vs: { property: string; detail: string }[]) =>
    vs.filter((v) => v.property === "picture-fit").map((v) => v.detail);

  it("passes the part of the page's shape drawn across the whole page", async () => {
    const out = await pdfOf([{ source: "wide", size: A4_ACROSS, stored: cut }]);
    expect(await checkImageToPdf(sources(), request, out, "full")).toEqual([]);
  });

  it("passes a part drawn turned, stored with the page's shape before the turn", async () => {
    // tall 10×30 turned across: its centre 10×14 drawn a quarter turned over a landscape A4.
    const out = await pdfOf([
      { source: "tall", size: A4_ACROSS, stored: solidPng(10, 14), quarterTurned: true, draw: [0, A4_ACROSS[1], A4_ACROSS[1], A4_ACROSS[0]] },
    ]);
    const turned: ImageToPdfRequest = { pages: [image("tall", 90)], pageSize: A4, margin: "fill" };
    expect(await checkImageToPdf(sources(), turned, out, "full")).toEqual([]);
  });

  it("flags a picture that does not cover its page", async () => {
    const out = await pdfOf([{ source: "wide", size: A4_ACROSS, stored: cut, draw: [10, 10, 821.8898, 575.2756] }]);
    expect(fitDetails(await checkImageToPdf(sources(), request, out, "full"))).toEqual([
      "page 1: picture does not cover the page",
    ]);
  });

  it("flags a picture off centre", async () => {
    const out = await pdfOf([{ source: "wide", size: A4_ACROSS, stored: cut, draw: [-20, -20, 861.8898, 615.2756] }]);
    expect(fitDetails(await checkImageToPdf(sources(), request, out, "full"))).toEqual([
      "page 1: picture past the page's edge, off centre",
    ]);
  });

  it("flags the whole picture stretched across the page", async () => {
    const out = await pdfOf([{ source: "wide", size: A4_ACROSS }]);
    expect(fitDetails(await checkImageToPdf(sources(), request, out, "full"))).toEqual([
      "page 1: picture not its shape",
    ]);
  });

  it("flags the whole picture kept, its pixels past the page's edges left in the file", async () => {
    // 40×20 at its shape, as tall as the page and centred: 1190.6 pt wide.
    const out = await pdfOf([{ source: "wide", size: A4_ACROSS, draw: [-174.38, 0, 1190.5512, 595.2756] }]);
    expect(fitDetails(await checkImageToPdf(sources(), request, out, "full"))).toEqual([
      "page 1: picture past the page's edge",
    ]);
  });
});

describe("checkImageToPdf: broken outputs", () => {
  const pages = [image("wide"), image("tall")];

  it("flags a missing page at quick depth", async () => {
    const out = await pdfOf([{ source: "wide", size: [40, 20] }]);
    expect(props(await checkImageToPdf(sources(), { pages, pageSize: IMAGE_FIT }, out, "quick"))).toEqual([
      "page-count",
    ]);
  });

  it("flags unopenable bytes at quick depth", async () => {
    const out = new TextEncoder().encode("%PDF-1.7 truncated");
    expect(props(await checkImageToPdf(sources(), { pages, pageSize: IMAGE_FIT }, out, "quick"))).toEqual([
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
    const vs = await checkImageToPdf(sources(), { pages, pageSize: IMAGE_FIT }, await doc.save(), "quick");
    expect(props(vs)).toContain("first-page-renders");
  });

  it("flags an image-fit page that is not its image's size, at full depth only", async () => {
    const out = await pdfOf([
      { source: "wide", size: [40, 20] },
      { source: "tall", size: [30, 10] },
    ]);
    const src = sources();
    expect(await checkImageToPdf(src, { pages, pageSize: IMAGE_FIT }, out, "quick")).toEqual([]);
    // The picture fills the wrong page, so it is stretched as well.
    expect(props(await checkImageToPdf(src, { pages, pageSize: IMAGE_FIT }, out, "full"))).toEqual([
      "page-size",
      "picture-fit",
    ]);
  });

  it("flags an image-fit page that ignores the photo's EXIF orientation", async () => {
    const out = await pdfOf([{ source: "phone", size: [3, 2] }]);
    const vs = await checkImageToPdf(
      sources(),
      { pages: [image("phone")], pageSize: IMAGE_FIT },
      out,
      "full",
    );
    // The picture fills the wrong page, so it is stretched as well.
    expect(props(vs)).toEqual(["page-size", "picture-fit"]);
  });

  it("flags an image-fit page whose turn was not applied", async () => {
    const out = await pdfOf([
      { source: "wide", size: [40, 20] },
      { source: "tall", size: [10, 30] },
    ]);
    const turned = [image("wide"), image("tall", 90)];
    expect(props(await checkImageToPdf(sources(), { pages: turned, pageSize: IMAGE_FIT }, out, "full"))).toEqual([
      "page-rotation",
    ]);
  });

  it("flags a preset page not turned to its picture", async () => {
    const out = await pdfOf([
      { source: "wide", size: A4_ACROSS, draw: [0, 87.17, 841.8898, 420.9449] },
      { source: "tall", size: A4_ACROSS, draw: [321.73, 0, 198.4252, 595.2756] },
    ]);
    expect(props(await checkImageToPdf(sources(), { pages, pageSize: A4 }, out, "full"))).toEqual([
      "page-size",
    ]);
  });

  it("flags a preset page turned instead of drawn turned", async () => {
    const out = await pdfOf([
      { source: "wide", size: A4_ACROSS, draw: [0, 87.17, 841.8898, 420.9449] },
      { source: "tall", size: A4_UP, draw: [157.32, 0, 280.6299, 841.8898], rotation: 90 },
    ]);
    expect(props(await checkImageToPdf(sources(), { pages, pageSize: A4 }, out, "full"))).toEqual([
      "page-rotation",
    ]);
  });

  it.each<[string, [number, number, number, number]]>([
    ["drawn past the page's edge", [-10, 87.17, 841.8898, 420.9449]],
    ["stretched to the page", [0, 0, 841.8898, 595.2756]],
    ["smaller than fits", [100, 100, 400, 200]],
  ])("flags a preset page whose picture is %s", async (_, draw) => {
    const out = await pdfOf([
      { source: "wide", size: A4_ACROSS, draw },
      { source: "tall", size: A4_UP, draw: [157.32, 0, 280.6299, 841.8898] },
    ]);
    expect(props(await checkImageToPdf(sources(), { pages, pageSize: A4 }, out, "full"))).toEqual([
      "picture-fit",
    ]);
  });

  it("flags an image-fit page whose picture does not fill it", async () => {
    const out = await pdfOf([
      { source: "wide", size: [40, 20], draw: [0, 0, 20, 10] },
      { source: "tall", size: [10, 30] },
    ]);
    expect(props(await checkImageToPdf(sources(), { pages, pageSize: IMAGE_FIT }, out, "full"))).toEqual([
      "picture-fit",
    ]);
  });

  it("flags a page that shows no image", async () => {
    const out = await pdfOf([
      { source: "wide", size: [40, 20] },
      { source: null, size: [10, 30] },
    ]);
    expect(props(await checkImageToPdf(sources(), { pages, pageSize: IMAGE_FIT }, out, "full"))).toEqual([
      "page-image",
    ]);
  });

  it("flags an output far larger than its images", async () => {
    const doc = await PDFDocument.load(await pdfOf([{ source: "photo", size: [3, 2] }]));
    // Random bytes do not compress, so the file really grows by 200 KB.
    await doc.attach(randomBytes(200_000), "padding.bin");
    const vs = await checkImageToPdf(
      sources(),
      { pages: [image("photo")], pageSize: IMAGE_FIT },
      await doc.save(),
      "full",
    );
    expect(props(vs)).toEqual(["size-bound"]);
  });

  it.each<[string, Uint8Array]>([
    ["EXIF, GPS, XMP, IPTC, a comment and an appended picture", withPhotoInfo(JPEG_3x2)],
    ["an EXIF segment alone", withExifOrientation(JPEG_3x2, 1)],
    ["data after the picture's end", Uint8Array.from([...JPEG_3x2, 0xff, 0xd8, 0xff, 0xd9])],
  ])("flags a JPEG still carrying %s, at quick depth", async (_, photo) => {
    const doc = await PDFDocument.create();
    const jpg = await doc.embedJpg(photo);
    doc.addPage([3, 2]).drawImage(jpg, { x: 0, y: 0, width: 3, height: 2 });
    const vs = await checkImageToPdf(
      new Map([["gps", photo]]),
      { pages: [image("gps")], pageSize: IMAGE_FIT },
      await doc.save(),
      "quick",
    );
    expect(props(vs)).toEqual(["photo-info"]);
  });

  it("keeps the caller's output bytes intact", async () => {
    const out = await pdfOf([{ source: "photo", size: [3, 2] }]);
    const copy = out.slice();
    await checkImageToPdf(sources(), { pages: [image("photo")], pageSize: IMAGE_FIT }, out, "full");
    expect(out).toEqual(copy);
  });
});
