// src/lib/ppt/groupsToRangeText.test.ts
import { describe, it, expect } from "vitest";
import { groupsToRangeText } from "./groupsToRangeText";
import type { BackgroundGroup } from "./groupBackgrounds";

function g(key: string, idx: number[]): BackgroundGroup {
  return { key, source: "slide", imageBlob: null, slideIndexes: idx };
}

describe("groupsToRangeText", () => {
  it("serializes the union of checked groups into canonical ranges", () => {
    const groups = [g("a", [1, 2, 3, 4]), g("b", [9, 10]), g("c", [7])];
    const text = groupsToRangeText(groups, new Set(["a", "c"]));
    expect(text).toBe("1-4, 7");
  });

  it("returns empty string when nothing is checked", () => {
    expect(groupsToRangeText([g("a", [1])], new Set())).toBe("");
  });

  it("merges adjacent indexes across groups", () => {
    const groups = [g("a", [1, 2]), g("b", [3, 4])];
    expect(groupsToRangeText(groups, new Set(["a", "b"]))).toBe("1-4");
  });
});
