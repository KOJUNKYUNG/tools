import { describe, it, expect } from "vitest";
import { assertPptxIntegrity } from "./pptCompressIntegrity";

const base = {
  originalEntryNames: [
    "[Content_Types].xml",
    "ppt/slides/slide1.xml",
    "ppt/media/image1.jpg",
  ],
  outputEntryNames: [
    "[Content_Types].xml",
    "ppt/slides/slide1.xml",
    "ppt/media/image1.jpg",
  ],
  originalSlideCount: 1,
  outputSlideCount: 1,
  originalSize: 1000,
  compressedSize: 800,
};

describe("assertPptxIntegrity", () => {
  it("passes when entries, slide count, and size are intact", () => {
    expect(() => assertPptxIntegrity(base)).not.toThrow();
  });

  it("throws CORRUPT_OUTPUT when the entry count changed", () => {
    expect(() =>
      assertPptxIntegrity({
        ...base,
        outputEntryNames: ["[Content_Types].xml", "ppt/slides/slide1.xml"],
      }),
    ).toThrowError(/^CORRUPT_OUTPUT/);
  });

  it("throws CORRUPT_OUTPUT when an entry name disappeared (rename)", () => {
    expect(() =>
      assertPptxIntegrity({
        ...base,
        outputEntryNames: [
          "[Content_Types].xml",
          "ppt/slides/slide1.xml",
          "ppt/media/image1.png",
        ],
      }),
    ).toThrowError(/^CORRUPT_OUTPUT/);
  });

  it("throws CORRUPT_OUTPUT when the slide count dropped", () => {
    expect(() =>
      assertPptxIntegrity({ ...base, outputSlideCount: 0 }),
    ).toThrowError(/^CORRUPT_OUTPUT/);
  });

  it("throws CORRUPT_OUTPUT when the output is empty", () => {
    expect(() =>
      assertPptxIntegrity({ ...base, compressedSize: 0 }),
    ).toThrowError(/^CORRUPT_OUTPUT/);
  });
});
