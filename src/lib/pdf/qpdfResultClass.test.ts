import { describe, it, expect } from "vitest";
import { classifyQpdfResult } from "./qpdfResultClass";

describe("classifyQpdfResult", () => {
  it("treats exit 0 with output as ok", () => {
    expect(classifyQpdfResult(0, "", true)).toBe("ok");
  });

  it("treats exit 3 (warnings, succeeded) with output as ok — NOT a failure", () => {
    // qpdf exit codes: 0 = clean, 2 = error, 3 = warnings (operation succeeded).
    // A 6MB fixture produced exit 3 ("object has offset 0" warnings) with a
    // fully valid encrypted PDF. The old `exit !== 0` guard wrongly rejected it.
    const stderr = "WARNING: object has offset 0\noperation succeeded with warnings";
    expect(classifyQpdfResult(3, stderr, true)).toBe("ok");
  });

  it("classifies a wrong-password failure from stderr regardless of exit code", () => {
    expect(classifyQpdfResult(2, "/input.pdf: invalid password", false)).toBe(
      "wrong-password",
    );
  });

  it("detects 'incorrect password' phrasing too", () => {
    expect(classifyQpdfResult(2, "incorrect password supplied", false)).toBe(
      "wrong-password",
    );
  });

  it("classifies a real error (exit 2, no output, no password text) as failed", () => {
    expect(classifyQpdfResult(2, "some other error", false)).toBe("failed");
  });

  it("classifies missing output as failed even if exit looks ok", () => {
    expect(classifyQpdfResult(0, "", false)).toBe("failed");
  });

  it("classifies exit 1 (Emscripten abort) with output as failed, NOT ok", () => {
    // Only 0 (clean) and 3 (warnings) are success codes. An abort surfaced as
    // status=1 may leave a truncated output file that must not pass as ok.
    expect(classifyQpdfResult(1, "", true)).toBe("failed");
  });

  it("prioritizes wrong-password even when output happens to exist", () => {
    // Defensive: if qpdf ever emits the password warning but also writes a
    // partial file, the password signal should still win.
    expect(classifyQpdfResult(2, "invalid password", true)).toBe("wrong-password");
  });
});
