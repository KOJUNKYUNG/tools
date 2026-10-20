import { PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { J2K_16x16 } from "@/lib/pdf/testImages";
import { nodePdfjsAdapter } from "./pdfjsNode";

/** A one-page PDF painting `J2K_16x16` as a JPXDecode image XObject. */
async function jpxPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([16, 16]);
  const image = doc.context.register(
    doc.context.stream(J2K_16x16, {
      Type: "XObject",
      Subtype: "Image",
      Width: 16,
      Height: 16,
      Filter: "JPXDecode",
    }),
  );
  page.node.setXObject(PDFName.of("Im0"), image);
  const content = doc.context.register(doc.context.stream("q 16 0 0 16 0 0 cm /Im0 Do Q"));
  page.node.set(PDFName.of("Contents"), content);
  return doc.save();
}

describe("nodePdfjsAdapter", () => {
  it("decodes JPEG 2000 images", async () => {
    const { lib, docParams } = await nodePdfjsAdapter.load();
    const doc = await lib.getDocument({
      ...docParams,
      data: await jpxPdf(),
      verbosity: lib.VerbosityLevel.ERRORS,
    }).promise;
    try {
      const page = await doc.getPage(1);
      const { fnArray, argsArray } = await page.getOperatorList();
      const at = fnArray.indexOf(lib.OPS.paintImageXObject);
      expect(at).toBeGreaterThanOrEqual(0);
      const [id] = argsArray[at] as [string];
      // pdfjs keeps the paint operator when decoding fails but stores null.
      const image = await new Promise<{ width: number } | null>((resolve) =>
        page.objs.get(id, resolve),
      );
      expect(image?.width).toBe(16);
    } finally {
      await doc.destroy();
    }
  });
});
