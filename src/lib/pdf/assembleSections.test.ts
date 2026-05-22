import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  assembleSections,
  detectImageFormat,
  packageOutputs,
} from "./assembleSections";
import type { PageItem, Rotation } from "./pageItem";

/** Build a blank PDF with `pageCount` pages of the given size. */
async function makePdfBytes(
  pageCount: number,
  size: [number, number] = [200, 300],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage(size);
  return doc.save();
}

// 1x1 transparent PNG (standard, valid).
const PNG_1x1 = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ),
);


function pdfItem(
  sourceFileId: string,
  sourcePageIndex: number,
  overrides: Partial<PageItem> = {},
): PageItem {
  return {
    id: `${sourceFileId}-${sourcePageIndex}-${Math.random()}`,
    sourceFileId,
    sourceFileName: `${sourceFileId}.pdf`,
    kind: "pdf",
    sourcePageIndex,
    rotation: 0,
    splitAfter: false,
    deleted: false,
    ...overrides,
  };
}

function imageItem(
  sourceFileId: string,
  overrides: Partial<PageItem> = {},
): PageItem {
  return {
    id: `${sourceFileId}-img-${Math.random()}`,
    sourceFileId,
    sourceFileName: `${sourceFileId}.png`,
    kind: "image",
    sourcePageIndex: 0,
    rotation: 0,
    splitAfter: false,
    deleted: false,
    ...overrides,
  };
}

describe("assembleSections", () => {
  it("merges a single source with no dividers into one pdf", async () => {
    const bytes = await makePdfBytes(3);
    const sources = new Map([["f1", bytes]]);
    const sections = [[pdfItem("f1", 0), pdfItem("f1", 1), pdfItem("f1", 2)]];

    const outputs = await assembleSections({ sections, sourceBytesById: sources });

    expect(outputs).toHaveLength(1);
    const out = await PDFDocument.load(outputs[0]);
    expect(out.getPageCount()).toBe(3);
  });

  it("merges pages from multiple sources in order", async () => {
    const sources = new Map([
      ["f1", await makePdfBytes(2)],
      ["f2", await makePdfBytes(1)],
    ]);
    const sections = [[pdfItem("f1", 0), pdfItem("f1", 1), pdfItem("f2", 0)]];

    const outputs = await assembleSections({ sections, sourceBytesById: sources });

    expect(outputs).toHaveLength(1);
    expect((await PDFDocument.load(outputs[0])).getPageCount()).toBe(3);
  });

  it("splits every page into its own pdf", async () => {
    const sources = new Map([["f1", await makePdfBytes(3)]]);
    const sections = [
      [pdfItem("f1", 0)],
      [pdfItem("f1", 1)],
      [pdfItem("f1", 2)],
    ];

    const outputs = await assembleSections({ sections, sourceBytesById: sources });

    expect(outputs).toHaveLength(3);
    for (const o of outputs) {
      expect((await PDFDocument.load(o)).getPageCount()).toBe(1);
    }
  });

  it("applies rotation to the output page", async () => {
    const sources = new Map([["f1", await makePdfBytes(1)]]);
    const sections = [[pdfItem("f1", 0, { rotation: 90 as Rotation })]];

    const outputs = await assembleSections({ sections, sourceBytesById: sources });

    const out = await PDFDocument.load(outputs[0]);
    expect(out.getPage(0).getRotation().angle).toBe(90);
  });

  it("embeds an image as a page sized to the image", async () => {
    const sources = new Map([["img1", PNG_1x1]]);
    const sections = [[imageItem("img1")]];

    const outputs = await assembleSections({ sections, sourceBytesById: sources });

    const out = await PDFDocument.load(outputs[0]);
    expect(out.getPageCount()).toBe(1);
    const { width, height } = out.getPage(0).getSize();
    expect(width).toBe(1);
    expect(height).toBe(1);
  });

  it("preserves order in a mixed pdf + image section", async () => {
    const sources = new Map<string, Uint8Array>([
      ["f1", await makePdfBytes(1, [200, 300])],
      ["img1", PNG_1x1],
    ]);
    const sections = [[pdfItem("f1", 0), imageItem("img1")]];

    const outputs = await assembleSections({ sections, sourceBytesById: sources });

    const out = await PDFDocument.load(outputs[0]);
    expect(out.getPageCount()).toBe(2);
    expect(out.getPage(0).getSize().width).toBe(200);
    expect(out.getPage(1).getSize().width).toBe(1);
  });

  it("reports progress up to 100", async () => {
    const sources = new Map([["f1", await makePdfBytes(2)]]);
    const sections = [[pdfItem("f1", 0), pdfItem("f1", 1)]];
    const seen: number[] = [];

    await assembleSections(
      { sections, sourceBytesById: sources },
      (p) => seen.push(p),
    );

    expect(seen.at(-1)).toBe(100);
  });
});

describe("detectImageFormat", () => {
  it("recognizes PNG magic bytes", () => {
    expect(detectImageFormat(PNG_1x1)).toBe("png");
  });

  it("recognizes JPEG magic bytes", () => {
    const jpegHeader = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageFormat(jpegHeader)).toBe("jpg");
  });

  it("throws on an unsupported format", () => {
    const gifHeader = Uint8Array.from([0x47, 0x49, 0x46, 0x38]);
    expect(() => detectImageFormat(gifHeader)).toThrow();
  });
});

describe("packageOutputs", () => {
  it("returns a single pdf when there is one section", async () => {
    const data = await makePdfBytes(1);

    const result = await packageOutputs([data], "report");

    expect(result.type).toBe("pdf");
    expect(result.filename).toBe("report.pdf");
    expect(result.data).toBe(data);
  });

  it("zips multiple outputs with numbered names", async () => {
    const outputs = [await makePdfBytes(1), await makePdfBytes(1)];

    const result = await packageOutputs(outputs, "report");

    expect(result.type).toBe("zip");
    expect(result.filename).toBe("report-split.zip");
    const zip = await JSZip.loadAsync(result.data);
    expect(Object.keys(zip.files).sort()).toEqual([
      "report-1.pdf",
      "report-2.pdf",
    ]);
  });
});
