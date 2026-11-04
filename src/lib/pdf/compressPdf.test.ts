import { deflateSync } from "node:zlib";
import { PDFDict, PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CORRUPT_OUTPUT_PREFIX } from "@/lib/errors";
import { compressPdfFromBytes } from "./compressPdf";
import { initJustpdfForNode } from "./justpdfNode";
import * as check from "./pdfCompressCheck";
import { initQpdfForNode } from "./qpdfNode";

// The real checker by default; some tests make it report damage.
vi.mock("./pdfCompressCheck", async (importOriginal) => {
  const real = await importOriginal<typeof check>();
  return { ...real, checkPdfCompress: vi.fn(real.checkPdfCompress) };
});
const { checkPdfCompress } = await vi.importActual<typeof check>("./pdfCompressCheck");
const mockedCheck = vi.mocked(check.checkPdfCompress);

beforeAll(async () => {
  await initJustpdfForNode();
  initQpdfForNode();
});
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

/** Unfiltered, so a compressed output shrinks and is offered if it is sound. */
const paddingContent = "q Q\n".repeat(20_000);

const pageFonts = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPage(0).node.Resources()?.lookup(PDFName.of("Font"), PDFDict);

/**
 * Three fonts in one object stream, laid out as Adobe's writers lay them out
 * (irs-fw9.pdf, Designer 6.5): a space after the index, then the objects with
 * nothing between them. Both are legal. justpdf 0.1.2 started reading each
 * object one byte early, so it read the previous object's last `>`: every
 * object but the first failed, and it dropped them silently.
 */
function adjacentObjectStreamPdf(): Uint8Array {
  const latin1 = (s: string) => Buffer.from(s, "latin1");
  const fonts = ["Helvetica", "Courier", "Times-Roman"].map(
    (name) => `<</Type/Font/Subtype/Type1/BaseFont/${name}>>`,
  );
  let at = 0;
  const index = fonts.map((font, i) => {
    const pair = `${i + 4} ${at}`;
    at += font.length;
    return pair;
  });
  const head = `${index.join(" ")} `;
  const packed = deflateSync(latin1(head + fonts.join("")));
  // Draws with each font, or the compressor removes them as unused.
  const content = `BT /A 9 Tf (a) Tj /B 9 Tf (b) Tj /C 9 Tf (c) Tj ET\n${paddingContent}`;

  const parts: Buffer[] = [latin1("%PDF-1.7\n")];
  let size = parts[0].length;
  const offsets = new Map<number, number>();
  const write = (n: number, body: Buffer) => {
    offsets.set(n, size);
    const part = Buffer.concat([latin1(`${n} 0 obj\n`), body, latin1("\nendobj\n")]);
    parts.push(part);
    size += part.length;
  };
  write(1, latin1("<</Type/Catalog/Pages 2 0 R>>"));
  write(2, latin1("<</Type/Pages/Kids[3 0 R]/Count 1>>"));
  write(
    3,
    latin1(
      "<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]/Contents 7 0 R" +
        "/Resources<</Font<</A 4 0 R/B 5 0 R/C 6 0 R>>>>>>",
    ),
  );
  write(7, latin1(`<</Length ${content.length}>>stream\n${content}\nendstream`));
  write(
    8,
    Buffer.concat([
      latin1(
        `<</Type/ObjStm/N 3/First ${head.length}/Filter/FlateDecode/Length ${packed.length}>>stream\n`,
      ),
      packed,
      latin1("\nendstream"),
    ]),
  );
  const xrefAt = size;
  offsets.set(9, xrefAt);
  // /W [1 4 2]: type, offset or object stream, generation or index.
  const row = (type: number, a: number, b: number) => {
    const r = Buffer.alloc(7);
    r.writeUInt8(type, 0);
    r.writeUInt32BE(a, 1);
    r.writeUInt16BE(b, 5);
    return r;
  };
  const rows = [row(0, 0, 65535)];
  for (let n = 1; n <= 9; n++) {
    rows.push(n >= 4 && n <= 6 ? row(2, 8, n - 4) : row(1, offsets.get(n) ?? 0, 0));
  }
  const table = deflateSync(Buffer.concat(rows));
  parts.push(
    latin1(
      `9 0 obj\n<</Type/XRef/Size 10/W[1 4 2]/Root 1 0 R/Filter/FlateDecode/Length ${table.length}>>stream\n`,
    ),
    table,
    latin1(`\nendstream\nendobj\nstartxref\n${xrefAt}\n%%EOF\n`),
  );
  return new Uint8Array(Buffer.concat(parts));
}

/**
 * A page whose font is an object at generation 2, which is legal. justpdf 0.1.3
 * writes it at generation 0 and leaves the reference at 2, so it reads as null.
 */
function nonZeroGenerationPdf(): Uint8Array {
  // Draws with the font, or the compressor removes it as unused.
  const content = `BT /A 9 Tf (a) Tj ET\n${paddingContent}`;
  const objects: [number, number, string][] = [
    [1, 0, "<</Type/Catalog/Pages 2 0 R>>"],
    [2, 0, "<</Type/Pages/Kids[3 0 R]/Count 1>>"],
    [
      3,
      0,
      "<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]/Contents 5 0 R" +
        "/Resources<</Font<</A 4 2 R>>>>>>",
    ],
    [4, 2, "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>"],
    [5, 0, `<</Length ${content.length}>>stream\n${content}\nendstream`],
  ];
  let text = "%PDF-1.7\n";
  const rows = ["0000000000 65535 f \n"];
  for (const [n, generation, body] of objects) {
    const offset = String(text.length).padStart(10, "0");
    rows.push(`${offset} ${String(generation).padStart(5, "0")} n \n`);
    text += `${n} ${generation} obj\n${body}\nendobj\n`;
  }
  const xrefAt = text.length;
  text += `xref\n0 6\n${rows.join("")}trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return new TextEncoder().encode(text);
}

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
      imageReencodeSkipped: false,
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

  it("says when a recovered file could not shrink: a stronger preset would recover the same way", async () => {
    mockedCheck.mockResolvedValueOnce(damaged);
    const result = await compressPdfFromBytes({ bytes: await incompressible(), preset: "medium" });
    expect(result).toMatchObject({ kind: "not-smaller", imageReencodeSkipped: true });
  });

  it("blocks when the re-compression is damaged too", async () => {
    mockedCheck.mockResolvedValue(damaged);
    await expect(
      compressPdfFromBytes({ bytes: await compressible(), preset: "medium" }),
    ).rejects.toThrow(CORRUPT_OUTPUT_PREFIX);
  });

  it("keeps every object of an object stream written without separators", async () => {
    const bytes = adjacentObjectStreamPdf();
    const result = await compressPdfFromBytes({ bytes, preset: "low" });
    if (result.kind !== "compressed") throw new Error(result.kind);
    // Read right the first time: a recovery here would hide a bug coming back.
    expect(mockedCheck).toHaveBeenCalledTimes(1);
    expect(await checkPdfCompress(bytes, { preset: "low" }, result.data, "full")).toEqual([]);
    const fonts = await pageFonts(result.data);
    expect(fonts?.keys().map(String)).toEqual(["/A", "/B", "/C"]);
    fonts?.keys().forEach((key) => expect(fonts.lookup(key)).toBeInstanceOf(PDFDict));
  });

  describe("an output that lost objects", () => {
    const lost = [{ property: check.REFERENCES_RESOLVE, detail: "test" }];

    it("recovers an object the compressor really lost", async () => {
      const bytes = nonZeroGenerationPdf();
      const result = await compressPdfFromBytes({ bytes, preset: "low" });
      if (result.kind !== "compressed") throw new Error(result.kind);
      // The first output failed the check, the recovered one passed it.
      expect(mockedCheck).toHaveBeenCalledTimes(2);
      expect(await checkPdfCompress(bytes, { preset: "low" }, result.data, "full")).toEqual([]);
      expect((await pageFonts(result.data))?.lookup(PDFName.of("A"))).toBeInstanceOf(PDFDict);
    });

    it("re-compresses at the preset's settings, from a plain rewrite of the file", async () => {
      mockedCheck.mockResolvedValueOnce(lost);
      const bytes = await compressible();
      const result = await compressPdfFromBytes({ bytes, preset: "medium" });
      expect(result).toMatchObject({ kind: "compressed", imageReencodeSkipped: false });
      expect(mockedCheck).toHaveBeenCalledTimes(2);
      // Judged against the user's file, not the rewrite.
      expect(mockedCheck.mock.calls[1][0]).toBe(bytes);
    });

    it("recovers on Light too", async () => {
      mockedCheck.mockResolvedValueOnce(lost);
      const result = await compressPdfFromBytes({ bytes: await compressible(), preset: "low" });
      expect(result).toMatchObject({ kind: "compressed", imageReencodeSkipped: false });
    });

    it("blocks when the rewrite loses them too", async () => {
      mockedCheck.mockResolvedValue(lost);
      await expect(
        compressPdfFromBytes({ bytes: await compressible(), preset: "medium" }),
      ).rejects.toThrow(CORRUPT_OUTPUT_PREFIX);
    });
  });

  it("blocks Light's damage without a retry: it has no safer setting", async () => {
    mockedCheck.mockResolvedValue(damaged);
    await expect(
      compressPdfFromBytes({ bytes: await compressible(), preset: "low" }),
    ).rejects.toThrow(CORRUPT_OUTPUT_PREFIX);
    expect(mockedCheck).toHaveBeenCalledTimes(1);
  });
});
