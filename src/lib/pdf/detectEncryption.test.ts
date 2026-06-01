import { describe, it, expect } from "vitest";
import { isEncryptionError } from "./detectEncryption";

describe("isEncryptionError", () => {
  it("recognizes pdf-lib's EncryptedPDFError by name", () => {
    const e = Object.assign(new Error("..."), { name: "EncryptedPDFError" });
    expect(isEncryptionError(e)).toBe(true);
  });

  it("recognizes the 'is encrypted' message text", () => {
    const e = new Error("Input document to `PDFDocument.load` is encrypted.");
    expect(isEncryptionError(e)).toBe(true);
  });

  it("is case-insensitive about 'encrypted'", () => {
    expect(isEncryptionError(new Error("Document is ENCRYPTED"))).toBe(true);
  });

  it("returns false for an unrelated parse error", () => {
    expect(isEncryptionError(new Error("Failed to parse PDF structure"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isEncryptionError("encrypted")).toBe(false);
    expect(isEncryptionError(null)).toBe(false);
    expect(isEncryptionError(undefined)).toBe(false);
  });
});
