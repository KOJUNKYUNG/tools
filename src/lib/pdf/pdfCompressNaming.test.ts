import { describe, expect, it } from "vitest";
import { deriveCompressedName } from "./pdfCompressNaming";

describe("deriveCompressedName", () => {
  it("appends -compressed before a lowercase .pdf extension", () => {
    expect(deriveCompressedName("report.pdf")).toBe("report-compressed.pdf");
  });

  it("normalizes an uppercase .PDF extension to lowercase", () => {
    expect(deriveCompressedName("report.PDF")).toBe("report-compressed.pdf");
  });

  it("appends -compressed.pdf when there is no extension", () => {
    expect(deriveCompressedName("no-ext")).toBe("no-ext-compressed.pdf");
  });

  it("falls back to compressed.pdf for an empty name", () => {
    expect(deriveCompressedName("")).toBe("compressed.pdf");
  });

  it("strips only the trailing .pdf for multi-dot names", () => {
    expect(deriveCompressedName("a.b.pdf")).toBe("a.b-compressed.pdf");
  });
});
