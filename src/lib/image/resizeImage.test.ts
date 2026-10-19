import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/dictionaries/en.json";
import { getErrorMessage } from "@/lib/errors";
import { resizeImage, resizeTarget } from "./resizeImage";

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

describe("resizeImage: an image the browser cannot open", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is the user's file, not the tool's problem (#83)", async () => {
    // A browser image that fails to decode, as a damaged file does.
    vi.stubGlobal(
      "Image",
      class {
        onerror: (() => void) | null = null;
        set src(_: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
    const file = new File([new Uint8Array([1, 2, 3])], "broken.jpg", { type: "image/jpeg" });
    const err = await resizeImage({ file, mode: "percent", percent: 50 }).catch((e: unknown) => e);
    expect(getErrorMessage(err, { copy: en.common.errors }).message).toBe(
      en.common.errors.invalidFile,
    );
  });
});
