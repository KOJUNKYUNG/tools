import { describe, expect, it } from "vitest";
import { estimateCompressedSize, selectSizeEstimate } from "./compressEstimate";

describe("estimateCompressedSize", () => {
  it("clamps to the static upper bound when the formula would exceed it", () => {
    expect(estimateCompressedSize(1_000_000, 0.03, "high")).toBe(400_000);
  });
  it("clamps the low preset to its static upper bound (~90% of original)", () => {
    expect(estimateCompressedSize(1_000_000, 0, "low")).toBe(900_000);
  });
  it("shrinks medium preset proportional to image share (~50% of image bytes)", () => {
    expect(estimateCompressedSize(1_000_000, 0.5, "medium")).toBe(700_000);
  });
  it("shrinks high preset more aggressively (~35% of image bytes)", () => {
    expect(estimateCompressedSize(1_000_000, 1, "high")).toBeCloseTo(350_000, -1);
  });
  it("never returns more than the preset's static upper bound", () => {
    expect(estimateCompressedSize(1_000_000, 0, "medium")).toBeLessThanOrEqual(700_000);
    expect(estimateCompressedSize(1_000_000, 0, "high")).toBeLessThanOrEqual(400_000);
  });
});

describe("selectSizeEstimate", () => {
  it("prefers the real compressed size when a live result is present", () => {
    expect(
      selectSizeEstimate({ originalSize: 1_000_000, actualCompressedSize: 512_000, imageShare: 0.9, preset: "high" }),
    ).toEqual({ kind: "actual", size: 512_000 });
  });

  it("uses the model when no real size but image share is known and above cutoff", () => {
    const r = selectSizeEstimate({ originalSize: 1_000_000, actualCompressedSize: null, imageShare: 0.5, preset: "medium" });
    expect(r).toEqual({ kind: "model", size: 700_000 });
  });

  it("returns noChange when image share is below the preset cutoff", () => {
    const r = selectSizeEstimate({ originalSize: 1_000_000, actualCompressedSize: null, imageShare: 0.01, preset: "medium" });
    expect(r).toEqual({ kind: "noChange" });
  });

  it("low preset always reports noChange regardless of image share", () => {
    const r = selectSizeEstimate({ originalSize: 1_000_000, actualCompressedSize: null, imageShare: 1, preset: "low" });
    expect(r).toEqual({ kind: "noChange" });
  });

  it("falls back to the static range when image share is unknown", () => {
    const r = selectSizeEstimate({ originalSize: 1_000_000, actualCompressedSize: null, imageShare: null, preset: "medium" });
    expect(r).toEqual({ kind: "range", from: 400_000, to: 700_000 });
  });
});
