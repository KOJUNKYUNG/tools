import { createRequire } from "node:module";
import path from "node:path";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { QpdfInstance } from "@/lib/pdf/qpdf";
import { inspectPdf, type PdfInspection } from "./pdfInspector";

type CreateModule = (opts: {
  locateFile: (file: string) => string;
  noInitialRun: boolean;
}) => Promise<QpdfInstance>;

async function samplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([200, 300]).drawText("first", { x: 10, y: 10, font });
  doc.addPage([400, 100]).setRotation(degrees(90));
  // An out-of-range angle, as pdf-lib writes when rotations accumulate.
  doc.addPage([100, 100]).setRotation(degrees(450));
  return doc.save();
}

/** Encrypt with qpdf (a third engine) so pdfjs sees a real /Encrypt. */
async function encrypt(
  bytes: Uint8Array,
  userPassword: string,
  restrictions: string[] = [],
): Promise<Uint8Array> {
  const dir = path.dirname(
    createRequire(import.meta.url).resolve("@neslinesli93/qpdf-wasm"),
  );
  const mod = await import("@neslinesli93/qpdf-wasm");
  // The bundled typings omit noInitialRun and FS.writeFile (see qpdf.ts).
  const createModule = (mod.default ?? mod) as unknown as CreateModule;
  const qpdf = await createModule({
    locateFile: (file: string) => path.join(dir, file),
    noInitialRun: true,
  });
  qpdf.FS.writeFile("/in.pdf", bytes);
  qpdf.callMain([
    "--encrypt",
    userPassword,
    "owner",
    "256",
    ...restrictions,
    "--",
    "/in.pdf",
    "/out.pdf",
  ]);
  return qpdf.FS.readFile("/out.pdf");
}

const status = (i: PdfInspection) => Promise.resolve(i.status);

describe("inspectPdf", () => {
  it("reports page count, per-page rotation and size, and render state", async () => {
    const report = await inspectPdf(await samplePdf(), async (i) => {
      if (i.status !== "open") throw new Error(i.status);
      const { pdf } = i;
      return {
        pageCount: pdf.pageCount,
        pages: [await pdf.page(1), await pdf.page(2), await pdf.page(3)],
        loads: await pdf.loadError(1),
        renders: await pdf.renderError(1),
        text: await pdf.text(1),
        image: await pdf.drawsImage(1),
        encrypted: await pdf.encrypted(),
      };
    });
    expect(report).toEqual({
      pageCount: 3,
      pages: [
        { rotation: 0, width: 200, height: 300 },
        { rotation: 90, width: 400, height: 100 },
        { rotation: 90, width: 100, height: 100 },
      ],
      loads: null,
      renders: null,
      text: "first",
      image: false,
      encrypted: false,
    });
  });

  it("reports a page that does not load", async () => {
    const doc = await PDFDocument.load(await samplePdf());
    // The page tree's first kid points at nothing.
    doc.catalog.Pages().Kids().set(0, doc.context.nextRef());
    const errors = await inspectPdf(await doc.save(), async (i) =>
      i.status === "open" ? [await i.pdf.loadError(1), await i.pdf.renderError(1)] : i.status,
    );
    expect(errors).toEqual([expect.any(String), expect.any(String)]);
  });

  it("leaves the caller's bytes intact", async () => {
    const bytes = await samplePdf();
    const copy = bytes.slice();
    await inspectPdf(bytes, status);
    expect(bytes).toEqual(copy);
  });

  it.each([
    ["empty", new Uint8Array(0)],
    ["not a pdf", new TextEncoder().encode("hello")],
  ])("reports %s bytes as unopenable", async (_, bytes) => {
    expect(await inspectPdf(bytes, status)).toBe("unopenable");
  });

  it("reports truncated bytes as unopenable", async () => {
    const bytes = await samplePdf();
    expect(await inspectPdf(bytes.slice(0, bytes.length / 2), status)).toBe(
      "unopenable",
    );
  });

  it("asks for the password of an encrypted file, and opens it with one", async () => {
    const locked = await encrypt(await samplePdf(), "secret");
    expect(await inspectPdf(locked, status)).toBe("password-required");
    const opened = await inspectPdf(
      locked,
      async (i) => (i.status === "open" ? [i.pdf.pageCount, await i.pdf.encrypted()] : i.status),
      { password: "secret" },
    );
    expect(opened).toEqual([3, true]);
  });

  it("reads what an encrypted file permits, and nothing restricted on a plain one", async () => {
    const permissions = (bytes: Uint8Array) =>
      inspectPdf(
        bytes,
        async (i) => (i.status === "open" ? i.pdf.permissions() : i.status),
        { password: "secret" },
      );
    const plain = await samplePdf();
    expect(await permissions(plain)).toBeNull();
    expect(
      await permissions(await encrypt(plain, "secret", ["--print=none", "--modify=none"])),
    ).toEqual({ print: false, copy: true, modify: false });
    expect(await permissions(await encrypt(plain, "secret", ["--extract=n"]))).toEqual({
      print: true,
      copy: false,
      modify: true,
    });
  });
});
