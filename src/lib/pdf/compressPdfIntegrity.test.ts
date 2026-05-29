import { describe, expect, it } from "vitest";
import {
  assertCompressedPdfIntegrity,
  CORRUPT_OUTPUT_MARKER,
} from "./compressPdfIntegrity";

const PDF_HEADER = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
function pdfLike(extra = 100): Uint8Array {
  const out = new Uint8Array(PDF_HEADER.length + extra);
  out.set(PDF_HEADER);
  return out;
}

describe("assertCompressedPdfIntegrity", () => {
  it("passes a healthy compression that preserves page count", () => {
    expect(() =>
      assertCompressedPdfIntegrity({
        data: pdfLike(1000),
        originalSize: 10_000,
        compressedSize: 5_000,
        sourcePageCount: 10,
        outputPageCount: 10,
        outputAnalyzed: true,
      }),
    ).not.toThrow();
  });

  it("throws when the output bytes are empty", () => {
    expect(() =>
      assertCompressedPdfIntegrity({
        data: new Uint8Array(0),
        originalSize: 10_000,
        compressedSize: 0,
        sourcePageCount: 5,
        outputPageCount: 0,
        outputAnalyzed: false,
      }),
    ).toThrow(CORRUPT_OUTPUT_MARKER);
  });

  it("throws when the output does not start with %PDF", () => {
    const garbage = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x01, 0x02]);
    expect(() =>
      assertCompressedPdfIntegrity({
        data: garbage,
        originalSize: 10_000,
        compressedSize: garbage.length,
        sourcePageCount: 5,
        outputPageCount: 5,
        outputAnalyzed: true,
      }),
    ).toThrow(/missing %PDF header/);
  });

  it("throws when the output has fewer pages than the source (analyze succeeded)", () => {
    expect(() =>
      assertCompressedPdfIntegrity({
        data: pdfLike(500),
        originalSize: 1_000_000,
        compressedSize: 500_000,
        sourcePageCount: 10,
        outputPageCount: 3,
        outputAnalyzed: true,
      }),
    ).toThrow(/page count dropped/);
  });

  it("does NOT throw page-drop when output analyze threw (gated on outputAnalyzed)", () => {
    // Healthy-but-unparseable-by-analyzer output should not false-positive
    // the page-drop branch. Ratio is healthy (50%) so ratio branch also stays quiet.
    expect(() =>
      assertCompressedPdfIntegrity({
        data: pdfLike(500),
        originalSize: 1_000_000,
        compressedSize: 500_000,
        sourcePageCount: 10,
        outputPageCount: 0,
        outputAnalyzed: false,
      }),
    ).not.toThrow();
  });

  it("throws on the documented 3.2MB → 24KB silent-corruption pattern", () => {
    // The reported case: 0.78% ratio, multi-page source, output unanalyzable.
    // Ratio branch catches it regardless of outputAnalyzed.
    expect(() =>
      assertCompressedPdfIntegrity({
        data: pdfLike(20_000),
        originalSize: 3_200_000,
        compressedSize: 24_600,
        sourcePageCount: 13,
        outputPageCount: 0,
        outputAnalyzed: false,
      }),
    ).toThrow(CORRUPT_OUTPUT_MARKER);
  });

  it("accepts a legitimately tiny ratio when page count survives (image-heavy deck)", () => {
    // The 163MB fixture compresses to ~13MB (~8%) with all 41 pages preserved.
    expect(() =>
      assertCompressedPdfIntegrity({
        data: pdfLike(50_000),
        originalSize: 170_000_000,
        compressedSize: 14_000_000,
        sourcePageCount: 41,
        outputPageCount: 41,
        outputAnalyzed: true,
      }),
    ).not.toThrow();
  });

  it("is tolerant when source analyze failed (sourcePageCount=0)", () => {
    // Source page count unknown — skip the page-drop comparison.
    expect(() =>
      assertCompressedPdfIntegrity({
        data: pdfLike(500),
        originalSize: 1_000_000,
        compressedSize: 500_000,
        sourcePageCount: 0,
        outputPageCount: 0,
        outputAnalyzed: true,
      }),
    ).not.toThrow();
  });

  it("does not flag a tiny ratio on a single-page source", () => {
    // Single-page docs can legitimately collapse far smaller — don't trip
    // the multi-page collapse heuristic on them.
    expect(() =>
      assertCompressedPdfIntegrity({
        data: pdfLike(500),
        originalSize: 1_000_000,
        compressedSize: 20_000,
        sourcePageCount: 1,
        outputPageCount: 1,
        outputAnalyzed: true,
      }),
    ).not.toThrow();
  });
});
