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

const jpegAt = (bytes: number, quality: number | null, fullChroma = false) => ({
  kind: "jpeg" as const,
  bytes,
  quality,
  fullChroma,
});
const freshJpeg = (bytes: number) => jpegAt(bytes, 95);
const freshPng = (bytes: number, visiblePixels: number | null = null) => ({
  kind: "png" as const,
  bytes,
  visiblePixels,
  palette: false,
  colors: null,
  unusedAlpha: false,
});

describe("estimatePptxSize", () => {
  it("shrinks a fresh JPEG by what its source quality leaves at the preset", () => {
    // q95 sits midway between the measured q94 and q96 points:
    // low (0.549+0.443)/2 = 0.496, medium (0.404+0.331)/2 = 0.3675,
    // high (0.312+0.253)/2 = 0.2825; 200 untouched + 800 * ratio
    expect(estimatePptxSize(1000, [freshJpeg(800)], "low")).toBeCloseTo(596.8);
    expect(estimatePptxSize(1000, [freshJpeg(800)], "medium")).toBeCloseTo(494);
    expect(estimatePptxSize(1000, [freshJpeg(800)], "high")).toBeCloseTo(426);
  });
  it("shrinks a photo PNG to about 1.5 bytes per visible pixel", () => {
    // 800 bytes over 200 visible pixels; per visible pixel low 1.55,
    // medium 1.498, high 1.419: 200 + 200 * that
    const photo = freshPng(800, 200);
    expect(estimatePptxSize(1000, [photo], "low")).toBeCloseTo(510);
    expect(estimatePptxSize(1000, [photo], "medium")).toBeCloseTo(499.6);
    expect(estimatePptxSize(1000, [photo], "high")).toBeCloseTo(483.8);
  });
  it("counts only a cut-out's visible pixels", () => {
    // the same 800 bytes with half the pixels transparent: 200 + 100 * 1.498
    expect(estimatePptxSize(1000, [freshPng(800, 100)], "medium")).toBeCloseTo(349.8);
  });
  it("shrinks a flat graphic PNG only a little", () => {
    // 800 bytes over 8000 pixels: the per-pixel bound is far above, so the
    // graphic ratio low 0.841, medium 0.824, high 0.791: 200 + 800 * that
    const graphic = freshPng(800, 8000);
    expect(estimatePptxSize(1000, [graphic], "low")).toBeCloseTo(872.8);
    expect(estimatePptxSize(1000, [graphic], "medium")).toBeCloseTo(859.2);
    expect(estimatePptxSize(1000, [graphic], "high")).toBeCloseTo(832.8);
  });
  it("shrinks a PNG of unknown size like a flat graphic, promising the least", () => {
    expect(estimatePptxSize(1000, [freshPng(800)], "medium")).toBeCloseTo(859.2);
  });
  it("shrinks a 4:4:4 JPEG further, as re-encoding drops its full-resolution chroma", () => {
    // q95 4:4:4 at medium: 0.3675 * 0.77 (real 4:4:4 q95 photos, n=11);
    // 200 + 800 * 0.282975
    expect(estimatePptxSize(1000, [jpegAt(800, 95, true)], "medium")).toBeCloseTo(426.38);
    // below q90 nothing was measured, so the curve alone: q86 at medium 0.609
    expect(estimatePptxSize(1000, [jpegAt(800, 86, true)], "medium")).toBeCloseTo(687.2);
  });
  it("promises no more than the images can shrink when they are a small share", () => {
    // 5% jpeg share at high: 950 untouched + 50*0.2825 ≈ 964 (not the 800
    // the static range would suggest)
    expect(estimatePptxSize(1000, [freshJpeg(50)], "high")).toBeCloseTo(964.125);
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
      expect(looksAlreadyCompressed(jpegAt(1, 70), "medium")).toBe(true);
      expect(looksAlreadyCompressed(jpegAt(1, 72), "medium")).toBe(true);
      expect(looksAlreadyCompressed(jpegAt(1, 73), "medium")).toBe(false);
      // a fresh q85 export still shrinks at light (82)
      expect(looksAlreadyCompressed(jpegAt(1, 85), "low")).toBe(false);
    });
    it("is not assumed when a JPEG's quality cannot be read", () => {
      expect(looksAlreadyCompressed(jpegAt(1, null), "high")).toBe(false);
    });
    it("is an indexed (palette) PNG", () => {
      const png = { ...freshPng(1), palette: true };
      expect(looksAlreadyCompressed(png, "low")).toBe(true);
      expect(looksAlreadyCompressed(freshPng(1), "high")).toBe(false);
    });
    it("is a PNG already within the preset's colour budget", () => {
      // medium quantizes to 4096 * 0.7 = 2867.2, so up to 2868 colours
      const png = (colors: number) => ({ ...freshPng(1), colors });
      expect(looksAlreadyCompressed(png(2863), "medium")).toBe(true);
      expect(looksAlreadyCompressed(png(2868), "medium")).toBe(true);
      expect(looksAlreadyCompressed(png(2869), "medium")).toBe(false);
      expect(looksAlreadyCompressed(png(2863), "high")).toBe(false);
    });
    it("is the engine's own PNG output, which keeps the budget rounded up", () => {
      // low's budget is 4096 * 0.82 = 3358.72; an opaque photo's low output
      // has 3359 colours (#87)
      const png = { ...freshPng(1), colors: 3359 };
      expect(looksAlreadyCompressed(png, "low")).toBe(true);
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
      // 600 fresh q95 jpeg + 300 jpeg already at q70: 100 + 600*0.3675 + 300 = 620.5
      const media = [freshJpeg(600), jpegAt(300, 70)];
      expect(estimatePptxSize(1000, media, "medium")).toBeCloseTo(620.5);
    });
    it("shrinks only a little when it was saved at a weaker preset and re-run stronger", () => {
      // a deck compressed at medium (JPEGs at q70), re-run at high:
      // 900 * 0.89 + 100 = 901, not 900 * 0.42 + 100 = 478
      const media = [jpegAt(900, 70)];
      expect(estimatePptxSize(1000, media, "high")).toBeCloseTo(901);
    });
    it("re-run from low shrinks by the measured step to the chosen preset", () => {
      // JPEGs at q82 (low's own output): medium 0.86, high 0.51
      const media = [jpegAt(900, 82)];
      expect(estimatePptxSize(1000, media, "medium")).toBeCloseTo(874);
      expect(estimatePptxSize(1000, media, "high")).toBeCloseTo(559);
    });
    it("a JPEG near a preset's quality follows the same curve, not a band", () => {
      // q80 leaves high 0.546 (measured), not low's re-run 0.51:
      // 100 + 900*0.546
      const media = [jpegAt(900, 80)];
      expect(estimatePptxSize(1000, media, "high")).toBeCloseTo(591.4);
    });
    it("re-run PNG shrinks by the step from the tightest weaker budget it fits", () => {
      // budgets: low 3359, medium 2867; high re-runs at 2252
      const png = (colors: number) => [{ ...freshPng(900), colors }];
      expect(estimatePptxSize(1000, png(3000), "medium")).toBeCloseTo(973); // low → medium 0.97
      expect(estimatePptxSize(1000, png(3000), "high")).toBeCloseTo(928); // low → high 0.92
      expect(estimatePptxSize(1000, png(2500), "high")).toBeCloseTo(955); // medium → high 0.95
    });
    it("a JPEG between presets' qualities shrinks only as far as its quality allows", () => {
      // q76 is neither medium's 70 nor low's 82, and leaves medium 0.96,
      // high 0.835 (a KakaoTalk q75 photo kept 0.91 / 0.75), not the 0.58 /
      // 0.42 a q95 photo would: 100 + 900 * ratio
      const media = [jpegAt(900, 76)];
      expect(estimatePptxSize(1000, media, "medium")).toBeCloseTo(964);
      expect(estimatePptxSize(1000, media, "high")).toBeCloseTo(851.5);
    });
    it("gives no number when every image is already compressed", () => {
      const media = [jpegAt(900, 70)];
      expect(estimatePptxSize(1000, media, "medium")).toBeNull();
    });
  });
});
