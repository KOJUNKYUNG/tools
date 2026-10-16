import { randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { Violation } from "@/lib/output-check/core";
import { checkPdfCompress } from "./pdfCompressCheck";

async function pdfOf(pages: number): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    doc.addPage([200, 300]).drawText(`page ${i + 1}`, { x: 10, y: 10, font });
  }
  return doc;
}

/** A 3-page input that carries 50 KB of incompressible padding. */
async function input(): Promise<Uint8Array> {
  const doc = await pdfOf(3);
  await doc.attach(randomBytes(50_000), "padding.bin");
  return doc.save();
}

/** The input's pages without the padding: what a good compression looks like. */
async function compressed(pages = 3): Promise<Uint8Array> {
  return (await pdfOf(pages)).save();
}

/** Page 1's entry in the page tree points at nothing: pdfjs cannot load it. */
async function brokenFirstPage(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  doc.catalog.Pages().Kids().set(0, doc.context.nextRef());
  return doc.save();
}

/** Adds an image whose soft mask is RGB, as the compressor's defect writes it. */
function addRgbSoftMask(doc: PDFDocument): void {
  const { context } = doc;
  const imageDict = (colorSpace: string) => ({
    Type: "XObject",
    Subtype: "Image",
    Width: 1,
    Height: 1,
    BitsPerComponent: 8,
    ColorSpace: colorSpace,
  });
  const mask = context.register(context.stream(new Uint8Array(3), imageDict("DeviceRGB")));
  context.register(
    context.stream(new Uint8Array(3), { ...imageDict("DeviceRGB"), SMask: mask }),
  );
}

const props = (vs: Violation[]) => vs.map((v) => v.property);
const request = { preset: "medium" as const };

describe("checkPdfCompress", () => {
  it("passes a smaller output with every page intact", async () => {
    expect(await checkPdfCompress(await input(), request, await compressed(), "quick")).toEqual([]);
  });

  it("flags an output whose first page pdfjs cannot render", async () => {
    const out = await brokenFirstPage(await compressed());
    // The broken page tree may also cost pdfjs's page count; render is the point.
    expect(props(await checkPdfCompress(await input(), request, out, "quick"))).toContain(
      "first-page-renders",
    );
  });

  it.each([
    ["larger than", 60_000],
    ["the same size as", 0],
  ])("flags an output %s the input", async (_, extra) => {
    const src = await input();
    const out = new Uint8Array(src.byteLength + extra);
    out.set(src);
    const vs = await checkPdfCompress(src, request, extra === 0 ? src : out, "quick");
    expect(props(vs)).toEqual(["size-bound"]);
  });

  it.each([
    ["empty output", new Uint8Array(0)],
    ["output without a %PDF header", new TextEncoder().encode("garbage, not a pdf")],
    ["truncated output", new TextEncoder().encode("%PDF-1.7 truncated")],
  ])("flags an %s as not opening", async (_, out) => {
    expect(props(await checkPdfCompress(await input(), request, out, "quick"))).toEqual([
      "pdf-opens",
    ]);
  });

  it("flags an output that lost pages (the upstream near-empty output pattern)", async () => {
    const vs = await checkPdfCompress(await input(), request, await compressed(1), "quick");
    expect(vs).toEqual([{ property: "page-count", detail: "3 pages → 1" }]);
  });

  it("flags an output with a soft mask that is not DeviceGray", async () => {
    const doc = await pdfOf(3);
    addRgbSoftMask(doc);
    const vs = await checkPdfCompress(await input(), request, await doc.save(), "quick");
    expect(props(vs)).toEqual(["soft-mask"]);
  });
});

describe("checkPdfCompress: inherited defects", () => {
  it("does not blame the tool for a soft mask the input already had", async () => {
    const withMask = async (padding: number) => {
      const doc = await pdfOf(3);
      addRgbSoftMask(doc);
      await doc.attach(randomBytes(padding), "padding.bin");
      return doc.save();
    };
    const vs = await checkPdfCompress(await withMask(50_000), request, await withMask(10), "quick");
    expect(vs).toEqual([]);
  });

  it("does not blame the tool for a first page the input cannot render either", async () => {
    const src = await brokenFirstPage(await input());
    const out = await brokenFirstPage(await compressed());
    expect(props(await checkPdfCompress(src, request, out, "quick"))).not.toContain(
      "first-page-renders",
    );
  });

  it("does not blame the tool for an input pdfjs cannot open either", async () => {
    const src = new TextEncoder().encode(`%PDF-1.7 truncated ${"x".repeat(100)}`);
    const out = new TextEncoder().encode("%PDF-1.7 truncated");
    expect(await checkPdfCompress(src, request, out, "quick")).toEqual([]);
  });

  it("keeps the caller's bytes intact", async () => {
    const src = await input();
    const out = await compressed();
    const [srcCopy, outCopy] = [src.slice(), out.slice()];
    await checkPdfCompress(src, request, out, "full");
    expect([src, out]).toEqual([srcCopy, outCopy]);
  });
});
