import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CORRUPT_OUTPUT_PREFIX } from "@/lib/errors";
import { compressPdfFromBytes } from "./compressPdf";
import { initJustpdfForNode } from "./justpdfNode";
import * as check from "./pdfCompressCheck";

// The real checker by default; some tests make it report damage.
vi.mock("./pdfCompressCheck", async (importOriginal) => {
  const real = await importOriginal<typeof check>();
  return { ...real, checkPdfCompress: vi.fn(real.checkPdfCompress) };
});
const { checkPdfCompress } = await vi.importActual<typeof check>("./pdfCompressCheck");
const mockedCheck = vi.mocked(check.checkPdfCompress);

beforeAll(initJustpdfForNode);
afterEach(() => mockedCheck.mockReset().mockImplementation(checkPdfCompress));

async function textPdf(rawContent?: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i++) {
    doc.addPage([200, 300]).drawText(`page ${i + 1}`, { x: 10, y: 10, font });
  }
  if (rawContent) {
    doc.getPage(0).node.addContentStream(doc.context.register(doc.context.stream(rawContent)));
  }
  return doc.save();
}

/** An unfiltered 80 KB content stream: justpdf deflates it to a few KB. */
const compressible = () => textPdf("q Q\n".repeat(20_000));
/** pdf-lib's tight output: justpdf's rewrite comes out larger. */
const incompressible = () => textPdf();

const damaged = [{ property: "soft-mask", detail: "test" }];

describe("compressPdfFromBytes", () => {
  it("returns a smaller file that passes the full check", async () => {
    const bytes = await compressible();
    const result = await compressPdfFromBytes({ bytes, preset: "medium" });
    if (result.kind !== "compressed") throw new Error(result.kind);
    expect(result.compressedSize).toBeLessThan(bytes.byteLength);
    expect(await checkPdfCompress(bytes, { preset: "medium" }, result.data, "full")).toEqual([]);
  });

  it("reports a file it could not shrink instead of offering the larger output", async () => {
    const bytes = await incompressible();
    const result = await compressPdfFromBytes({ bytes, preset: "medium" });
    expect(result).toEqual({
      kind: "not-smaller",
      originalSize: bytes.byteLength,
      compressedSize: expect.any(Number),
    });
    if (result.kind !== "not-smaller") throw new Error(result.kind);
    expect(result.compressedSize).toBeGreaterThanOrEqual(bytes.byteLength);
  });

  it("recovers damage by re-compressing without image re-encoding", async () => {
    mockedCheck.mockResolvedValueOnce(damaged);
    const result = await compressPdfFromBytes({ bytes: await compressible(), preset: "high" });
    expect(result).toMatchObject({ kind: "compressed", imageReencodeSkipped: true });
    expect(mockedCheck).toHaveBeenCalledTimes(2);
  });

  it("blocks when the re-compression is damaged too", async () => {
    mockedCheck.mockResolvedValue(damaged);
    await expect(
      compressPdfFromBytes({ bytes: await compressible(), preset: "medium" }),
    ).rejects.toThrow(CORRUPT_OUTPUT_PREFIX);
  });

  it("blocks Light's damage without a retry: it has no safer setting", async () => {
    mockedCheck.mockResolvedValue(damaged);
    await expect(
      compressPdfFromBytes({ bytes: await compressible(), preset: "low" }),
    ).rejects.toThrow(CORRUPT_OUTPUT_PREFIX);
    expect(mockedCheck).toHaveBeenCalledTimes(1);
  });
});
