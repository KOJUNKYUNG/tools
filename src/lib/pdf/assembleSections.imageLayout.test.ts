import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { assembleSections } from "./assembleSections";
import type { PageItem } from "./pageItem";

// Minimal 1x1 PNG (red pixel).
const PNG_1x1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

function imageItem(fileId: string): PageItem {
  return {
    id: "p1",
    sourceFileId: fileId,
    sourceFileName: "a.png",
    kind: "image",
    sourcePageIndex: 0,
    rotation: 0,
    splitAfter: false,
    deleted: false,
  };
}

describe("assembleSections imageLayout", () => {
  it("defaults to native: page size equals the image size", async () => {
    const id = "f1";
    const out = await assembleSections({
      sections: [[imageItem(id)]],
      sourceBytesById: new Map([[id, PNG_1x1]]),
    });
    const doc = await PDFDocument.load(out[0]);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(1, 1);
    expect(height).toBeCloseTo(1, 1);
  });

  it("fixed mode: page size equals the requested A4 size", async () => {
    const id = "f1";
    const out = await assembleSections({
      sections: [[imageItem(id)]],
      sourceBytesById: new Map([[id, PNG_1x1]]),
      imageLayout: { mode: "fixed", widthPt: 595, heightPt: 842 },
    });
    const doc = await PDFDocument.load(out[0]);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(595, 1);
    expect(height).toBeCloseTo(842, 1);
  });
});
