import { describe, expect, it } from "vitest";
import { estimateCompressedSize } from "./PdfCompressEstimate";

describe("estimateCompressedSize", () => {
  it("returns the original size when image share is zero", () => {
    expect(estimateCompressedSize(1_000_000, 0, "high")).toBe(1_000_000);
  });

  it("returns the original size for the low preset regardless of image share", () => {
    expect(estimateCompressedSize(1_000_000, 0.9, "low")).toBe(1_000_000);
  });

  it("shrinks medium preset proportional to image share (~50% of image bytes)", () => {
    // 1MB, 50% images → image portion 0.5MB stays at 0.5x → 0.25MB; text 0.5MB unchanged
    // total = 0.75MB
    expect(estimateCompressedSize(1_000_000, 0.5, "medium")).toBe(750_000);
  });

  it("shrinks high preset more aggressively (~35% of image bytes)", () => {
    // 1MB, 100% images → 0.35MB
    expect(estimateCompressedSize(1_000_000, 1, "high")).toBeCloseTo(350_000, -1);
  });

  it("never returns more than the original size", () => {
    expect(estimateCompressedSize(500_000, 1, "medium")).toBeLessThanOrEqual(500_000);
    expect(estimateCompressedSize(500_000, 1, "high")).toBeLessThanOrEqual(500_000);
  });
});
