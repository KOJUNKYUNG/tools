import { randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { PageItem, Rotation } from "./pageItem";
import { checkPdfArrange } from "./pdfArrangeCheck";

// Outputs here are drawn from scratch, never copied with pdf-lib's copyPages
// as the engine does: a page "is" a source page when it has the same size
// and text, which is what the checker compares.

interface PageSpec {
  text: string;
  size: [number, number];
  rotation?: number;
}

async function pdfOf(pages: PageSpec[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const { text, size, rotation = 0 } of pages) {
    const page = doc.addPage(size);
    page.drawText(text, { x: 10, y: 10, size: 12, font });
    if (rotation) page.setRotation(degrees(rotation));
  }
  return doc.save();
}

// Source "a": three pages of distinct sizes; page 3 is already rotated 90°.
const A: PageSpec[] = [
  { text: "A1", size: [200, 300] },
  { text: "A2", size: [300, 200] },
  { text: "A3", size: [250, 250], rotation: 90 },
];
const B: PageSpec[] = [{ text: "B1", size: [200, 300] }];

// 1×1 opaque PNG.
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ),
);

async function sources(): Promise<Map<string, Uint8Array>> {
  return new Map([
    ["a", await pdfOf(A)],
    ["b", await pdfOf(B)],
    ["img", PNG],
  ]);
}

function pdfPage(sourceFileId: string, sourcePageIndex: number, rotation: Rotation = 0): PageItem {
  return {
    id: `${sourceFileId}-${sourcePageIndex}`,
    sourceFileId,
    sourceFileName: `${sourceFileId}.pdf`,
    kind: "pdf",
    sourcePageIndex,
    rotation,
    splitAfter: false,
    deleted: false,
  };
}

function imagePage(rotation: Rotation = 0): PageItem {
  return { ...pdfPage("img", 0, rotation), sourceFileName: "img.png", kind: "image" };
}

/** A page of source `spec` as it should appear after `extra` rotation. */
const turned = (spec: PageSpec, extra = 0): PageSpec => ({
  ...spec,
  rotation: ((spec.rotation ?? 0) + extra) % 360,
});

async function imagePdf(rotation = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(PNG);
  const page = doc.addPage([1, 1]);
  page.drawImage(image, { x: 0, y: 0, width: 1, height: 1 });
  if (rotation) page.setRotation(degrees(rotation));
  return doc.save();
}

const props = (vs: { property: string }[]) => vs.map((v) => v.property);

describe("checkPdfArrange: good outputs", () => {
  it.each([
    [
      "merge",
      [[pdfPage("a", 0), pdfPage("a", 1), pdfPage("a", 2), pdfPage("b", 0)]],
      async () => [await pdfOf([A[0], A[1], A[2], B[0]])],
    ],
    [
      "split",
      [[pdfPage("a", 0)], [pdfPage("a", 1), pdfPage("a", 2)]],
      async () => [await pdfOf([A[0]]), await pdfOf([A[1], A[2]])],
    ],
    [
      "reorder",
      [[pdfPage("b", 0), pdfPage("a", 2), pdfPage("a", 0)]],
      async () => [await pdfOf([B[0], A[2], A[0]])],
    ],
    [
      "delete",
      [[pdfPage("a", 0), pdfPage("a", 2)]],
      async () => [await pdfOf([A[0], A[2]])],
    ],
    [
      "rotate (adds to a page's own rotation)",
      [[pdfPage("a", 0, 90), pdfPage("a", 2, 270)]],
      async () => [await pdfOf([turned(A[0], 90), turned(A[2], 270)])],
    ],
  ])("%s: no violations at full depth", async (_, sections, outputs) => {
    expect(
      await checkPdfArrange(await sources(), { sections }, await outputs(), "full"),
    ).toEqual([]);
  });

  it("an image page: no violations", async () => {
    expect(
      await checkPdfArrange(
        await sources(),
        { sections: [[imagePage(90)]] },
        [await imagePdf(90)],
        "full",
      ),
    ).toEqual([]);
  });
});

describe("checkPdfArrange: broken outputs", () => {
  const merge = [[pdfPage("a", 0), pdfPage("a", 1), pdfPage("a", 2)]];

  it("flags a missing page at quick depth", async () => {
    const out = [await pdfOf([A[0], A[1]])];
    expect(props(await checkPdfArrange(await sources(), { sections: merge }, out, "quick"))).toEqual([
      "page-count",
    ]);
  });

  it("flags an extra page at quick depth", async () => {
    const out = [await pdfOf([A[0], A[1], A[2], A[2]])];
    expect(props(await checkPdfArrange(await sources(), { sections: merge }, out, "quick"))).toEqual([
      "page-count",
    ]);
  });

  it("flags a wrong file count at quick depth", async () => {
    const sections = [[pdfPage("a", 0)], [pdfPage("a", 1)]];
    const out = [await pdfOf([A[0], A[1]])];
    expect(props(await checkPdfArrange(await sources(), { sections }, out, "quick"))).toContain(
      "file-count",
    );
  });

  it("flags unopenable bytes at quick depth", async () => {
    const out = [new TextEncoder().encode("%PDF-1.7 truncated")];
    const vs = await checkPdfArrange(await sources(), { sections: [[pdfPage("a", 0)]] }, out, "quick");
    expect(props(vs)).toEqual(["pdf-opens"]);
  });

  it("flags a first page that does not render at quick depth", async () => {
    // The page tree's first kid points at nothing: pdfjs counts the page but
    // cannot load it.
    const doc = await PDFDocument.load(await pdfOf([A[0], A[1]]));
    doc.catalog.Pages().Kids().set(0, doc.context.nextRef());
    const out = [await doc.save()];
    const sections = [[pdfPage("a", 0), pdfPage("a", 1)]];
    const vs = await checkPdfArrange(await sources(), { sections }, out, "quick");
    expect(props(vs)).toContain("first-page-renders");
  });

  it("flags a later file whose first page does not load at quick depth", async () => {
    const doc = await PDFDocument.load(await pdfOf([A[1], A[2]]));
    doc.catalog.Pages().Kids().set(0, doc.context.nextRef());
    const out = [await pdfOf([A[0]]), await doc.save()];
    const sections = [[pdfPage("a", 0)], [pdfPage("a", 1), pdfPage("a", 2)]];
    const vs = await checkPdfArrange(await sources(), { sections }, out, "quick");
    expect(vs).toContainEqual({ property: "first-page-renders", detail: expect.stringMatching(/^file 2: /) });
  });

  it("flags a wrong rotation at full depth only", async () => {
    const sections = [[pdfPage("a", 0, 90)]];
    const out = [await pdfOf([A[0]])];
    const src = await sources();
    expect(await checkPdfArrange(src, { sections }, out, "quick")).toEqual([]);
    expect(await checkPdfArrange(src, { sections }, out, "full")).toEqual([
      { property: "page-rotation", detail: "file 1 page 1: expected 90°, got 0°" },
    ]);
  });

  it("flags a page whose own rotation was dropped", async () => {
    const out = [await pdfOf([A[0], A[1], { ...A[2], rotation: 0 }])];
    expect(props(await checkPdfArrange(await sources(), { sections: merge }, out, "full"))).toEqual([
      "page-rotation",
    ]);
  });

  it("flags a wrong order at full depth only", async () => {
    const out = [await pdfOf([A[1], A[0], A[2]])];
    const src = await sources();
    expect(await checkPdfArrange(src, { sections: merge }, out, "quick")).toEqual([]);
    expect(props(await checkPdfArrange(src, { sections: merge }, out, "full"))).toEqual([
      "page-identity",
      "page-identity",
    ]);
  });

  it("flags an image page that shows no image", async () => {
    const out = [await pdfOf([{ text: "", size: [1, 1] }])];
    const vs = await checkPdfArrange(await sources(), { sections: [[imagePage()]] }, out, "full");
    expect(props(vs)).toEqual(["page-identity"]);
  });

  it("flags an output far larger than its sources", async () => {
    const big = await PDFDocument.load(await pdfOf([A[0]]));
    // Random bytes do not compress, so the file really grows by 200 KB.
    await big.attach(randomBytes(200_000), "padding.bin");
    const out = [await big.save()];
    const vs = await checkPdfArrange(await sources(), { sections: [[pdfPage("a", 0)]] }, out, "full");
    expect(props(vs)).toEqual(["size-bound"]);
  });
});

describe("checkPdfArrange: inherited defects", () => {
  it("does not blame the tool for a first page the source cannot render either", async () => {
    const broken = await PDFDocument.load(await pdfOf([A[0], A[1]]));
    broken.catalog.Pages().Kids().set(0, broken.context.nextRef());
    const bytes = await broken.save();
    const src = new Map([["a", bytes]]);
    // The source's broken first page, carried over as-is.
    const vs = await checkPdfArrange(src, { sections: [[pdfPage("a", 0)]] }, [bytes], "quick");
    expect(props(vs)).not.toContain("first-page-renders");
  });

  it("keeps the caller's output bytes intact", async () => {
    const out = [await pdfOf([A[0]])];
    const copy = out[0].slice();
    await checkPdfArrange(await sources(), { sections: [[pdfPage("a", 0)]] }, out, "full");
    expect(out[0]).toEqual(copy);
  });
});

