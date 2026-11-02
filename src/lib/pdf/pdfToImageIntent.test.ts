import { AnnotationFlags, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { nodePdfjsAdapter } from "@/lib/output-check/pdfjsNode";
import { pageIntent } from "./pdfToImageIntent";

/** `bytes` opened by real pdf.js. */
async function openDoc(bytes: Uint8Array) {
  const { lib, docParams } = await nodePdfjsAdapter.load();
  return lib.getDocument({ ...docParams, data: bytes, verbosity: lib.VerbosityLevel.ERRORS }).promise;
}

/** The intent chosen for the first page of `bytes`. */
async function intentOf(bytes: Uint8Array) {
  const doc = await openDoc(bytes);
  try {
    return await pageIntent(doc, await doc.getPage(1));
  } finally {
    await doc.destroy();
  }
}

/** A page with a stamp that has its own appearance, carrying `flags`. */
async function stamped(flags: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  const appearance = doc.context.register(
    doc.context.stream("0 0 1 rg 0 0 100 50 re f", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 100, 50] }),
  );
  page.node.addAnnot(
    doc.context.register(
      doc.context.obj({ Type: "Annot", Subtype: "Stamp", Rect: [20, 20, 120, 70], AP: { N: appearance }, F: flags }),
    ),
  );
  return doc.save();
}

/** A page in a document with a layer that shows on screen only; the page itself draws nothing from it. */
async function layered(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  const layer = doc.context.register(
    doc.context.obj({ Type: "OCG", Name: "screen only", Usage: { Print: { PrintState: "OFF" } } }),
  );
  doc.catalog.set(PDFName.of("OCProperties"), doc.context.obj({ OCGs: [layer], D: { ON: [layer] } }));
  return doc.save();
}

/** A filled-in field, in print or not. */
async function formField(printable: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 100]);
  const field = doc.getForm().createTextField("name");
  field.setText("Filled in");
  field.addToPage(page, { x: 20, y: 20, width: 200, height: 30 });
  field.acroField.getWidgets()[0].setFlagTo(AnnotationFlags.Print, printable);
  return doc.save();
}

describe("pageIntent", () => {
  it("uses print on a page with no annotations", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    expect(await intentOf(await doc.save())).toBe("print");
  });

  it("uses print when annotations show both on screen and in print", async () => {
    expect(await intentOf(await stamped(AnnotationFlags.Print))).toBe("print");
  });

  it("keeps display when an annotation would vanish in print", async () => {
    expect(await intentOf(await stamped(0))).toBe("display");
  });

  it("keeps display when an annotation would appear only in print", async () => {
    expect(await intentOf(await stamped(AnnotationFlags.Print | AnnotationFlags.NoView))).toBe("display");
  });

  it("uses print for a form field that prints", async () => {
    expect(await intentOf(await formField(true))).toBe("print");
  });

  it("keeps display for a form field that does not print", async () => {
    expect(await intentOf(await formField(false))).toBe("display");
  });

  it("keeps display in a document with layers", async () => {
    expect(await intentOf(await layered())).toBe("display");
  });

  it("keeps display when the page's annotations cannot be read", async () => {
    const source = await PDFDocument.create();
    source.addPage([200, 200]);
    const doc = await openDoc(await source.save());
    try {
      const page = await doc.getPage(1);
      vi.spyOn(page, "getAnnotations").mockRejectedValue(new Error("unreadable"));
      expect(await pageIntent(doc, page)).toBe("display");
    } finally {
      await doc.destroy();
    }
  });
});
