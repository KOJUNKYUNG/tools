import { describe, it, expect } from "vitest";
import {
  classifyMedia,
  pickSmaller,
  deriveCompressedName,
  estimatePptxSize,
  looksAlreadyCompressed,
  PRESET_QUALITY,
} from "./pptCompressPlan";

describe("classifyMedia", () => {
  it("re-encodes jpg/jpeg as JPEG at the preset quality", () => {
    expect(classifyMedia("jpg", "medium")).toEqual({
      kind: "jpeg",
      quality: PRESET_QUALITY.medium,
    });
    expect(classifyMedia("jpeg", "high")).toEqual({
      kind: "jpeg",
      quality: PRESET_QUALITY.high,
    });
  });

  it("re-encodes png as PNG (format preserved, transparency safe)", () => {
    expect(classifyMedia("png", "low")).toEqual({
      kind: "png",
      quality: PRESET_QUALITY.low,
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

const freshJpeg = (bytes: number) => ({ kind: "jpeg" as const, bytes, quality: 95 });
const freshPng = (bytes: number) => ({
  kind: "png" as const,
  bytes,
  palette: false,
  colors: null,
  unusedAlpha: false,
});

describe("estimatePptxSize", () => {
  it("shrinks JPEG bytes by the preset-dependent ratio", () => {
    // 1000 total, 800 jpeg, 0 png, medium jpeg ratio 0.58
    // (1000-800) + 800*0.58 = 200 + 464 = 664, under static upper (900)
    expect(estimatePptxSize(1000, [freshJpeg(800)], "medium")).toBe(664);
  });
  it("shrinks PNG bytes a little more at each stronger preset", () => {
    // png ratios low 0.64, medium 0.62, high 0.59; (1000-800) + 800*ratio
    expect(estimatePptxSize(1000, [freshPng(800)], "low")).toBe(712);
    expect(estimatePptxSize(1000, [freshPng(800)], "medium")).toBe(696);
    expect(estimatePptxSize(1000, [freshPng(800)], "high")).toBe(672);
  });
  it("promises no more than the images can shrink when they are a small share", () => {
    // 5% jpeg share at high: 950 untouched + 50*0.42 = 971 (not the 800 the
    // static range would suggest)
    expect(estimatePptxSize(1000, [freshJpeg(50)], "high")).toBe(971);
  });
  it("gives no number when too little of the deck can shrink", () => {
    // 1% image share is under every preset's cutoff
    expect(estimatePptxSize(1000, [freshJpeg(5), freshPng(5)], "high")).toBeNull();
    expect(estimatePptxSize(1000, [], "medium")).toBeNull();
    expect(estimatePptxSize(0, [], "medium")).toBeNull();
  });

  describe("an already compressed image", () => {
    it("is a JPEG saved at or near the preset's quality or lower", () => {
      // medium re-encodes at 70; within the 2-point margin counts
      expect(looksAlreadyCompressed({ kind: "jpeg", bytes: 1, quality: 70 }, "medium")).toBe(true);
      expect(looksAlreadyCompressed({ kind: "jpeg", bytes: 1, quality: 72 }, "medium")).toBe(true);
      expect(looksAlreadyCompressed({ kind: "jpeg", bytes: 1, quality: 73 }, "medium")).toBe(false);
      // a fresh q85 export still shrinks at light (82)
      expect(looksAlreadyCompressed({ kind: "jpeg", bytes: 1, quality: 85 }, "low")).toBe(false);
    });
    it("is not assumed when a JPEG's quality cannot be read", () => {
      expect(looksAlreadyCompressed({ kind: "jpeg", bytes: 1, quality: null }, "high")).toBe(false);
    });
    it("is an indexed (palette) PNG", () => {
      const png = { ...freshPng(1), palette: true };
      expect(looksAlreadyCompressed(png, "low")).toBe(true);
      expect(looksAlreadyCompressed(freshPng(1), "high")).toBe(false);
    });
    it("is a PNG already within the preset's colour budget", () => {
      // medium quantizes to 4096 * 0.7 ≈ 2867 colours
      const png = (colors: number) => ({ ...freshPng(1), colors });
      expect(looksAlreadyCompressed(png(2863), "medium")).toBe(true);
      expect(looksAlreadyCompressed(png(2868), "medium")).toBe(false);
      expect(looksAlreadyCompressed(png(2863), "high")).toBe(false);
    });
    it("is not a PNG the engine could still write indexed or without its alpha", () => {
      // 256 colours or fewer: the engine writes it indexed, which shrinks it
      expect(looksAlreadyCompressed({ ...freshPng(1), colors: 256 }, "medium")).toBe(false);
      expect(looksAlreadyCompressed({ ...freshPng(1), colors: 257 }, "medium")).toBe(true);
      // an alpha channel no pixel uses: the engine drops it
      const opaque = { ...freshPng(1), colors: 1000, unusedAlpha: true };
      expect(looksAlreadyCompressed(opaque, "medium")).toBe(false);
    });

    it("is expected to keep its size", () => {
      // 600 fresh jpeg + 300 jpeg already at q70: 100 + 600*0.58 + 300 = 748
      const media = [freshJpeg(600), { kind: "jpeg" as const, bytes: 300, quality: 70 }];
      expect(estimatePptxSize(1000, media, "medium")).toBe(748);
    });
    it("gives no number when every image is already compressed", () => {
      const media = [{ kind: "jpeg" as const, bytes: 900, quality: 70 }];
      expect(estimatePptxSize(1000, media, "medium")).toBeNull();
    });
  });
});
