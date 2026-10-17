import { describe, expect, it } from "vitest";
import { resizeTarget } from "./resizeImage";

describe("resizeTarget: the size the canvas is made, rounded once", () => {
  it.each([
    ["33% of 101×67", { width: 101, height: 67 }, { mode: "percent", percent: 33 }, [33, 22]],
    ["50% of 3×3 (halves round up)", { width: 3, height: 3 }, { mode: "percent", percent: 50 }, [2, 2]],
    ["1% of 10×10 (never below 1 px)", { width: 10, height: 10 }, { mode: "percent", percent: 1 }, [1, 1]],
    [
      "width 100, aspect locked, of 3×2",
      { width: 3, height: 2 },
      { mode: "pixel", width: 100, lockAspectRatio: true },
      [100, 67],
    ],
    [
      "height 100, aspect locked, of 3×2",
      { width: 3, height: 2 },
      { mode: "pixel", height: 100, lockAspectRatio: true },
      [150, 100],
    ],
    ["a preset", { width: 4000, height: 3000 }, { mode: "preset", width: 1920, height: 1080 }, [1920, 1080]],
  ] as const)("%s", (_, original, options, [width, height]) => {
    expect(resizeTarget(original, options)).toEqual({ width, height });
  });
});
