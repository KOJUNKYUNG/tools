import { describe, it, expect } from "vitest";
import { deriveOutputName } from "./watermarkNaming";

describe("deriveOutputName", () => {
  it("inserts -numbered before the .pdf extension", () => {
    expect(deriveOutputName("doc.pdf", "number")).toBe("doc-numbered.pdf");
  });
  it("inserts -watermarked for the watermark mode", () => {
    expect(deriveOutputName("doc.pdf", "watermark")).toBe("doc-watermarked.pdf");
  });
  it("lower-cases the extension on output", () => {
    expect(deriveOutputName("doc.PDF", "number")).toBe("doc-numbered.pdf");
  });
  it("only strips the trailing .pdf", () => {
    expect(deriveOutputName("a.b.pdf", "watermark")).toBe("a.b-watermarked.pdf");
  });
  it("appends to names without a .pdf extension", () => {
    expect(deriveOutputName("noext", "number")).toBe("noext-numbered.pdf");
  });
  it("falls back to a generic name on empty input", () => {
    expect(deriveOutputName("", "number")).toBe("output-numbered.pdf");
    expect(deriveOutputName("", "watermark")).toBe("output-watermarked.pdf");
  });
});
