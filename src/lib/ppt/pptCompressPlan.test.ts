import { describe, it, expect } from "vitest";
import {
  classifyMedia,
  pickSmaller,
  deriveCompressedName,
  estimatePptxSize,
  PRESET_JPEG_QUALITY,
} from "./pptCompressPlan";

describe("classifyMedia", () => {
  it("re-encodes jpg/jpeg as JPEG at the preset quality", () => {
    expect(classifyMedia("jpg", "medium")).toEqual({
      kind: "jpeg",
      quality: PRESET_JPEG_QUALITY.medium,
    });
    expect(classifyMedia("jpeg", "high")).toEqual({
      kind: "jpeg",
      quality: PRESET_JPEG_QUALITY.high,
    });
  });

  it("re-encodes png as PNG (format preserved, transparency safe)", () => {
    expect(classifyMedia("png", "low")).toEqual({
      kind: "png",
      quality: PRESET_JPEG_QUALITY.low,
    });
  });

  it("is case-insensitive on the extension", () => {
    expect(classifyMedia("JPG", "medium").kind).toBe("jpeg");
    expect(classifyMedia("PNG", "medium").kind).toBe("png");
  });

  it("passes through unsupported / vector / empty extensions", () => {
    expect(classifyMedia("emf", "high")).toEqual({ kind: "passthrough" });
    expect(classifyMedia("wmf", "high")).toEqual({ kind: "passthrough" });
    expect(classifyMedia("gif", "high")).toEqual({ kind: "passthrough" });
    expect(classifyMedia("svg", "high")).toEqual({ kind: "passthrough" });
    expect(classifyMedia("", "high")).toEqual({ kind: "passthrough" });
  });
});

describe("pickSmaller", () => {
  const orig = new Uint8Array([1, 2, 3, 4]);
  it("keeps the candidate when it is strictly smaller", () => {
    const cand = new Uint8Array([1, 2]);
    expect(pickSmaller(orig, cand)).toEqual({ bytes: cand, usedCandidate: true });
  });
  it("keeps the original when the candidate is larger or equal", () => {
    expect(pickSmaller(orig, new Uint8Array([1, 2, 3, 4, 5]))).toEqual({
      bytes: orig,
      usedCandidate: false,
    });
    expect(pickSmaller(orig, new Uint8Array([9, 9, 9, 9]))).toEqual({
      bytes: orig,
      usedCandidate: false,
    });
  });
  it("keeps the original when the candidate is null (re-encode failed)", () => {
    expect(pickSmaller(orig, null)).toEqual({ bytes: orig, usedCandidate: false });
  });
});

describe("deriveCompressedName", () => {
  it("inserts -compressed before the .pptx extension", () => {
    expect(deriveCompressedName("deck.pptx")).toBe("deck-compressed.pptx");
  });
  it("lower-cases the extension on output", () => {
    expect(deriveCompressedName("deck.PPTX")).toBe("deck-compressed.pptx");
  });
  it("only strips the trailing .pptx", () => {
    expect(deriveCompressedName("a.b.pptx")).toBe("a.b-compressed.pptx");
  });
  it("appends to names without a .pptx extension", () => {
    expect(deriveCompressedName("noext")).toBe("noext-compressed.pptx");
  });
  it("falls back to a generic name on empty input", () => {
    expect(deriveCompressedName("")).toBe("compressed.pptx");
  });
});

describe("estimatePptxSize", () => {
  it("shrinks only the recompressible portion by the preset ratio", () => {
    // 1000 total, 800 recompressible, medium ratio 0.6
    // (1000-800) + 800*0.6 = 200 + 480 = 680, under static upper (900)
    expect(estimatePptxSize(1000, 800, "medium")).toBe(680);
  });
  it("clamps to the static upper bound when the formula exceeds it", () => {
    // tiny recompressible share → formula ~1000 but high upper = 1000*0.75=750
    expect(estimatePptxSize(1000, 10, "high")).toBe(750);
  });
});
