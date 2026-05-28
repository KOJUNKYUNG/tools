import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractPageOne } from "./extractPageOne";

async function buildPdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`page ${i + 1}`, { x: 50, y: 750, size: 16 });
  }
  return doc.save();
}

describe("extractPageOne", () => {
  it("returns a valid PDF with exactly one page from a multi-page source", async () => {
    const src = await buildPdf(5);
    const out = await extractPageOne(src);
    const reopened = await PDFDocument.load(out);
    expect(reopened.getPageCount()).toBe(1);
  });

  it("returns a single-page PDF when the source has only one page", async () => {
    const src = await buildPdf(1);
    const out = await extractPageOne(src);
    const reopened = await PDFDocument.load(out);
    expect(reopened.getPageCount()).toBe(1);
  });

  it("produces output strictly smaller than (or equal to) the source for large docs", async () => {
    const src = await buildPdf(20);
    const out = await extractPageOne(src);
    expect(out.byteLength).toBeLessThan(src.byteLength);
  });

  it("does not detach or corrupt the caller's source bytes", async () => {
    const src = await buildPdf(3);
    const snapshot = new Uint8Array(src);
    await extractPageOne(src);
    expect(src.length).toBe(snapshot.length);
    expect(src[0]).toBe(snapshot[0]);
    expect(src[src.length - 1]).toBe(snapshot[snapshot.length - 1]);
  });
});
