import { describe, it, expect } from "vitest";
import { deriveLockedName, type LockMode } from "./pdfLockNaming";

describe("deriveLockedName", () => {
  it("appends -locked for lock mode", () => {
    expect(deriveLockedName("doc.pdf", "lock")).toBe("doc-locked.pdf");
  });

  it("appends -unlocked for unlock mode", () => {
    expect(deriveLockedName("doc.pdf", "unlock")).toBe("doc-unlocked.pdf");
  });

  it("is case-insensitive about the .pdf extension", () => {
    expect(deriveLockedName("REPORT.PDF", "lock")).toBe("REPORT-locked.pdf");
  });

  it("handles names without a .pdf extension", () => {
    expect(deriveLockedName("doc", "lock")).toBe("doc-locked.pdf");
  });

  it("falls back to 'output' for an empty name", () => {
    expect(deriveLockedName("", "lock")).toBe("output-locked.pdf");
    expect(deriveLockedName("", "unlock")).toBe("output-unlocked.pdf");
  });

  it("preserves dots inside the base name", () => {
    expect(deriveLockedName("2026.05.song.pdf", "unlock")).toBe(
      "2026.05.song-unlocked.pdf",
    );
  });

  it("accepts every LockMode value", () => {
    const modes: LockMode[] = ["lock", "unlock"];
    for (const m of modes) {
      expect(deriveLockedName("a.pdf", m)).toMatch(/^a-(un)?locked\.pdf$/);
    }
  });
});
