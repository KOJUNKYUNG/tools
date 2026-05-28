import { describe, expect, it } from "vitest";
import { estimateCompressedSize } from "./PdfCompressEstimate";

describe("estimateCompressedSize", () => {
  it("clamps to the static upper bound when the formula would exceed it", () => {
    // image-light high preset: formula → ~98% but static upper for high is 40%
    expect(estimateCompressedSize(1_000_000, 0.03, "high")).toBe(400_000);
  });

  it("clamps the low preset to its static upper bound (~90% of original)", () => {
    expect(estimateCompressedSize(1_000_000, 0, "low")).toBe(900_000);
  });

  it("shrinks medium preset proportional to image share (~50% of image bytes)", () => {
    // 1MB, 50% images → image portion 0.5MB stays at 0.5x → 0.25MB; text 0.5MB unchanged
    // formula = 0.75MB, static upper (medium) = 0.7MB → clamped to 0.7MB
    expect(estimateCompressedSize(1_000_000, 0.5, "medium")).toBe(700_000);
  });

  it("shrinks high preset more aggressively (~35% of image bytes)", () => {
    // 1MB, 100% images → formula 0.35MB, well under static upper 0.4MB
    expect(estimateCompressedSize(1_000_000, 1, "high")).toBeCloseTo(350_000, -1);
  });

  it("never returns more than the preset's static upper bound", () => {
    expect(estimateCompressedSize(1_000_000, 0, "medium")).toBeLessThanOrEqual(700_000);
    expect(estimateCompressedSize(1_000_000, 0, "high")).toBeLessThanOrEqual(400_000);
  });
});
