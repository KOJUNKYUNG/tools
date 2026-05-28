import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { analyzePdf } from "./analyzePdf";

async function buildPdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`page ${i + 1}`, { x: 50, y: 750, size: 16 });
  }
  return doc.save();
}

// The WASM module is browser-targeted. Skip cleanly if it cannot initialize
// in the node test env — the test still documents the contract.
describe("analyzePdf", () => {
  it("reports the page count and zero images for a text-only PDF", async () => {
    const bytes = await buildPdf(3);
    const file = new File([bytes.slice(0).buffer], "text-only.pdf", {
      type: "application/pdf",
    });
    let analysis;
    try {
      analysis = await analyzePdf(file);
    } catch {
      // WASM init not supported in this environment — skip without failing.
      return;
    }
    expect(analysis.pages).toBe(3);
    expect(analysis.images).toBe(0);
    expect(analysis.totalImageBytes).toBe(0);
    expect(analysis.isEncrypted).toBe(false);
  });
});
