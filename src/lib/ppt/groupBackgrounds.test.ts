import { describe, it, expect } from "vitest";
import { groupBackgrounds } from "./groupBackgrounds";
import type { SlideBackground } from "./extractCurrentBackgrounds";

function bg(i: number, path: string | null, source: SlideBackground["source"]): SlideBackground {
  return { slideIndex: i, slideName: `슬라이드 ${i}`, imageBlob: null, source, imagePath: path };
}

describe("groupBackgrounds", () => {
  it("dedups slides that share an image path into one group", () => {
    const groups = groupBackgrounds([
      bg(1, "ppt/media/a.png", "slide"),
      bg(2, "ppt/media/a.png", "slide"),
      bg(3, "ppt/media/b.png", "layout"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].slideIndexes).toEqual([1, 2]);
    expect(groups[1].slideIndexes).toEqual([3]);
  });

  it("groups all source==='none' slides under a single 'none' group", () => {
    const groups = groupBackgrounds([bg(1, null, "none"), bg(2, null, "none")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("none");
    expect(groups[0].slideIndexes).toEqual([1, 2]);
  });

  it("preserves first-seen order and keeps a representative blob", () => {
    const groups = groupBackgrounds([bg(2, "x", "slide"), bg(1, "x", "slide")]);
    expect(groups[0].slideIndexes).toEqual([2, 1]);
  });
});
