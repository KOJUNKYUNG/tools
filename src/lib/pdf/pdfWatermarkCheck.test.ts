import { randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { Violation } from "@/lib/output-check/core";
import type { OverlayOptions } from "./applyPdfOverlay";
import { checkPdfWatermark } from "./pdfWatermarkCheck";
import { JPEG_3x2, noisePng, solidPng } from "./testImages";

async function input(pages = 4): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    doc.addPage([200, 300]).drawText(`page ${i + 1}`, { x: 10, y: 10, font });
  }
  return doc.save();
}

/** Draw a mark on each listed 1-based page, as the engine does. */
async function marked(bytes: Uint8Array, pages: number[], png = solidPng(80, 20)) {
  const doc = await PDFDocument.load(bytes);
  const image = await doc.embedPng(png);
  for (const n of pages) {
    doc.getPage(n - 1).drawImage(image, { x: 20, y: 40, width: 80, height: 20, opacity: 0.3 });
  }
  return doc;
}

const numbers = (pages: number[]): OverlayOptions => ({
  mode: "number",
  format: "plain",
  suffix: "p",
  start: 1,
  grid: "bottom-center",
  fontPx: 12,
  color: "#444444",
  margin: 24,
  position: null,
  pages,
});

const watermark = (pages: number[]): OverlayOptions => ({
  mode: "watermark",
  source: "text",
  text: "DRAFT",
  fontPx: 48,
  color: "#888888",
  logo: null,
  logoScale: 0.4,
  opacity: 0.3,
  angle: 45,
  tile: false,
  tileGap: 1,
  grid: "center",
  margin: 24,
  position: null,
  pages,
});

const props = (vs: Violation[]) => vs.map((v) => v.property);

describe("checkPdfWatermark", () => {
  it("passes a marked output, for all, some or no selected pages, in both modes", async () => {
    const bytes = await input();
    for (const pages of [[1, 2, 3, 4], [2, 4], []]) {
      const output = pages.length ? await (await marked(bytes, pages)).save() : bytes;
      for (const request of [numbers(pages), watermark(pages)]) {
        expect(await checkPdfWatermark(bytes, request, output, "full")).toEqual([]);
      }
    }
  });

  it("flags a lost page", async () => {
    const bytes = await input();
    const doc = await marked(bytes, [1, 2, 3, 4]);
    doc.removePage(3);
    expect(props(await checkPdfWatermark(bytes, watermark([1, 2, 3, 4]), await doc.save(), "quick")))
      .toEqual(["page-count"]);
  });

  it("flags a mark drawn on a page the user did not select, at full depth", async () => {
    const bytes = await input();
    const output = await (await marked(bytes, [1, 2])).save();
    const request = numbers([2]);
    expect(await checkPdfWatermark(bytes, request, output, "quick")).toEqual([]);
    const violations = await checkPdfWatermark(bytes, request, output, "full");
    expect(props(violations)).toEqual(["untouched-pages"]);
    expect(violations[0].detail).toContain("page 1");
  });

  it("flags unopenable bytes", async () => {
    const bytes = await input();
    const output = (await (await marked(bytes, [1])).save()).slice(0, 300);
    expect(props(await checkPdfWatermark(bytes, watermark([1]), output, "quick"))).toEqual([
      "pdf-opens",
    ]);
  });

  it("flags empty or cut-off bytes even when pdfjs cannot open the input", async () => {
    const unreadable = new TextEncoder().encode("%PDF-1.7\nnot really a pdf");
    const output = await (await PDFDocument.create()).save();
    expect(await checkPdfWatermark(unreadable, watermark([1]), output, "quick")).toEqual([]);
    for (const broken of [new Uint8Array(0), output.slice(0, output.byteLength - 40)]) {
      expect(props(await checkPdfWatermark(unreadable, watermark([1]), broken, "quick"))).toEqual([
        "pdf-opens",
      ]);
    }
  });

  it("flags a first page that does not load (quick) or render (full)", async () => {
    const bytes = await input();
    const doc = await marked(bytes, [1]);
    doc.catalog.Pages().Kids().set(0, doc.context.nextRef());
    const output = await doc.save();
    for (const depth of ["quick", "full"] as const) {
      expect(props(await checkPdfWatermark(bytes, watermark([1]), output, depth))).toContain(
        "first-page-renders",
      );
    }
  });

  it("does not blame the tool for a first page the input cannot render either", async () => {
    const source = await PDFDocument.load(await input());
    source.catalog.Pages().Kids().set(0, source.context.nextRef());
    const bytes = await source.save();
    expect(props(await checkPdfWatermark(bytes, watermark([]), bytes, "full"))).not.toContain(
      "first-page-renders",
    );
  });

  it("flags an output far larger than the input and its marks, at full depth only", async () => {
    const bytes = await input();
    const doc = await marked(bytes, [1]);
    await doc.attach(randomBytes(200_000), "pad.bin");
    const output = await doc.save();
    expect(await checkPdfWatermark(bytes, watermark([1]), output, "quick")).toEqual([]);
    expect(props(await checkPdfWatermark(bytes, watermark([1]), output, "full"))).toEqual([
      "size-bound",
    ]);
  });

  it("allows a logo embedded byte for byte, metadata and all", async () => {
    // A 3×2 JPEG carrying ~120 KB of metadata: far more than its pixels.
    const app = (fill: number) => [0xff, 0xe2, 0xea, 0x62, ...new Uint8Array(60_000).fill(fill)];
    const logo = Uint8Array.from([...JPEG_3x2.slice(0, 2), ...app(1), ...app(2), ...JPEG_3x2.slice(2)]);
    const bytes = await input();
    const doc = await PDFDocument.load(bytes);
    const image = await doc.embedJpg(logo);
    doc.getPage(0).drawImage(image, { x: 5, y: 5, width: 30, height: 20 });
    const request = { ...watermark([1]), source: "image" as const, logo: { bytes: logo, kind: "jpg" as const } };
    expect(await checkPdfWatermark(bytes, request, await doc.save(), "full")).toEqual([]);
  });

  it("allows one mark image per page-number label", async () => {
    // 50 distinct labels of noise: ~50 × 4.8 KB of image data, far over the
    // input's size.
    const bytes = await input(50);
    const doc = await PDFDocument.load(bytes);
    for (let i = 0; i < 50; i++) {
      const label = await doc.embedPng(noisePng(40, 40));
      doc.getPage(i).drawImage(label, { x: 5, y: 5, width: 40, height: 40 });
    }
    const output = await doc.save();
    expect(output.byteLength).toBeGreaterThan(bytes.byteLength + 200_000);
    const pages = Array.from({ length: 50 }, (_, i) => i + 1);
    expect(await checkPdfWatermark(bytes, numbers(pages), output, "full")).toEqual([]);
  });
});
