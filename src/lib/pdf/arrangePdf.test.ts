import { randomBytes } from "node:crypto";
import { PDFDocument, PDFName, StandardFonts, degrees } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { getErrorMessage } from "@/lib/errors";
import { getPdfArrangeLabels } from "@/components/tools/pdf-arrange/labels";
import en from "@/i18n/dictionaries/en.json";
import ko from "@/i18n/dictionaries/ko.json";
import type { Dictionary } from "@/i18n/config";
import { arrangePdf } from "./assembleSections";
import type { PageItem, Rotation } from "./pageItem";
import * as check from "./pdfArrangeCheck";

// The real checker by default; one test makes it report a violation.
vi.mock("./pdfArrangeCheck", async (importOriginal) => {
  const real = await importOriginal<typeof check>();
  return { ...real, checkPdfArrange: vi.fn(real.checkPdfArrange) };
});
const { checkPdfArrange } = await vi.importActual<typeof check>("./pdfArrangeCheck");

async function pdfOf(texts: string[], rotate = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  texts.forEach((text, i) => {
    const page = doc.addPage([200 + i * 10, 300]);
    page.drawText(text, { x: 10, y: 10, font });
    if (rotate) page.setRotation(degrees(rotate));
  });
  return doc.save();
}

// 1×1 opaque PNG.
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ),
);

function item(
  sourceFileId: string,
  sourcePageIndex: number,
  rotation: Rotation = 0,
  kind: PageItem["kind"] = "pdf",
): PageItem {
  return {
    id: `${sourceFileId}-${sourcePageIndex}`,
    sourceFileId,
    sourceFileName: `${sourceFileId}.pdf`,
    kind,
    sourcePageIndex,
    rotation,
    splitAfter: false,
    deleted: false,
  };
}

async function sources() {
  return new Map([
    ["a", await pdfOf(["A1", "A2", "A3"])],
    ["b", await pdfOf(["B1", "B2"], 90)],
    ["img", PNG],
  ]);
}

describe("arrangePdf", () => {
  it.each<[string, PageItem[][]]>([
    ["merge", [[item("a", 0), item("a", 1), item("a", 2), item("b", 0), item("b", 1)]]],
    ["split", [[item("a", 0)], [item("a", 1), item("a", 2)], [item("b", 1)]]],
    ["reorder", [[item("b", 1), item("a", 2), item("a", 0), item("b", 0)]]],
    ["delete", [[item("a", 0), item("a", 2)]]],
    ["rotate", [[item("a", 0, 90), item("a", 1, 180), item("b", 0, 270)]]],
    ["image page", [[item("a", 0), item("img", 0, 90, "image")]]],
  ])("%s: the output passes the full check", async (_, sections) => {
    const src = await sources();
    const outputs = await arrangePdf({ sections, sourceBytesById: src });
    expect(await checkPdfArrange(src, { sections }, outputs, "full")).toEqual([]);
  });

  it("copies a resource its pages share once, not once per page", async () => {
    // Every page names one 100 KB stream (as decks share a font or logo).
    const doc = await PDFDocument.create();
    const shared = doc.context.register(doc.context.flateStream(randomBytes(100_000)));
    for (let i = 0; i < 8; i++) {
      const page = doc.addPage([200, 300]);
      page.node.setXObject(PDFName.of("Shared"), shared);
    }
    const src = new Map([["a", await doc.save()]]);
    const sections = [Array.from({ length: 8 }, (_, i) => item("a", i))];

    const outputs = await arrangePdf({ sections, sourceBytesById: src });
    expect(await checkPdfArrange(src, { sections }, outputs, "full")).toEqual([]);
  });

  it("blocks a failing quick check with the corrupt-output error and pdf-arrange's hint", async () => {
    vi.mocked(check.checkPdfArrange).mockResolvedValueOnce([
      { property: "page-count", detail: "file 1: 1 pages kept → 0" },
    ]);
    const err = await arrangePdf({
      sections: [[item("a", 0)]],
      sourceBytesById: await sources(),
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    // Narrowed by the assertion above.
    expect((err as Error).message).toMatch(/^CORRUPT_OUTPUT: pdf-arrange: page-count/);
    // JSON imports are typed by their literal shape; the app reads them as Dictionary.
    for (const dict of [ko, en] as Dictionary[]) {
      const hint = getPdfArrangeLabels(dict).errorCorrupt;
      expect(hint).toBeTruthy();
      expect(getErrorMessage(err, { corruptOutputHint: hint }).message).toBe(hint);
    }
  });
});
