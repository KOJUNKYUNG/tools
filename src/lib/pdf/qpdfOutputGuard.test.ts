import { describe, it, expect } from "vitest";
import { assertEncryptedPdf, assertDecryptedPdf } from "./qpdfOutputGuard";
import { CORRUPT_OUTPUT_MARKER } from "./compressPdfIntegrity";

function pdfBytes(body: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.7\n${body}\n%%EOF`);
}

describe("assertEncryptedPdf", () => {
  it("passes for a %PDF output that contains an /Encrypt dict", () => {
    const ok = pdfBytes("trailer << /Encrypt 5 0 R /Root 1 0 R >>");
    expect(() => assertEncryptedPdf(ok)).not.toThrow();
  });

  it("throws CORRUPT_OUTPUT for empty output", () => {
    expect(() => assertEncryptedPdf(new Uint8Array())).toThrow(CORRUPT_OUTPUT_MARKER);
  });

  it("throws CORRUPT_OUTPUT when the %PDF header is missing", () => {
    const noHeader = new TextEncoder().encode("not a pdf /Encrypt");
    expect(() => assertEncryptedPdf(noHeader)).toThrow(CORRUPT_OUTPUT_MARKER);
  });

  it("throws CORRUPT_OUTPUT when /Encrypt is absent (encryption silently no-op)", () => {
    const plain = pdfBytes("trailer << /Root 1 0 R >>");
    expect(() => assertEncryptedPdf(plain)).toThrow(CORRUPT_OUTPUT_MARKER);
  });
});

describe("assertDecryptedPdf", () => {
  it("passes for any well-formed %PDF output", () => {
    const ok = pdfBytes("trailer << /Root 1 0 R >>");
    expect(() => assertDecryptedPdf(ok)).not.toThrow();
  });

  it("does NOT require absence of /Encrypt (qpdf may keep the dict structure)", () => {
    const ok = pdfBytes("trailer << /Root 1 0 R >>");
    expect(() => assertDecryptedPdf(ok)).not.toThrow();
  });

  it("throws CORRUPT_OUTPUT for empty output", () => {
    expect(() => assertDecryptedPdf(new Uint8Array())).toThrow(CORRUPT_OUTPUT_MARKER);
  });

  it("throws CORRUPT_OUTPUT when the %PDF header is missing", () => {
    const noHeader = new TextEncoder().encode("garbage");
    expect(() => assertDecryptedPdf(noHeader)).toThrow(CORRUPT_OUTPUT_MARKER);
  });
});
