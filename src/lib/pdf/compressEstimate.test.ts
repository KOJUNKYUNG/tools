import { describe, expect, it } from "vitest";
import { selectSizeDisplay } from "./compressEstimate";

describe("selectSizeDisplay", () => {
  it("shows the measured size once the live compress for this preset is done", () => {
    expect(
      selectSizeDisplay({ actualCompressedSize: 512_000, livePreview: true, liveFailed: false }),
    ).toEqual({ kind: "actual", size: 512_000 });
  });

  it("reports computing while the live compress for this preset is pending", () => {
    expect(
      selectSizeDisplay({ actualCompressedSize: null, livePreview: true, liveFailed: false }),
    ).toEqual({ kind: "computing" });
  });

  it("defers to after compressing when the file is above the live-preview gate", () => {
    expect(
      selectSizeDisplay({ actualCompressedSize: null, livePreview: false, liveFailed: false }),
    ).toEqual({ kind: "afterCompress" });
  });

  it("defers to after compressing when the live compress failed (no endless spinner)", () => {
    expect(
      selectSizeDisplay({ actualCompressedSize: null, livePreview: true, liveFailed: true }),
    ).toEqual({ kind: "afterCompress" });
  });

  it("never invents a number: no measured size means no size", () => {
    for (const livePreview of [true, false]) {
      for (const liveFailed of [true, false]) {
        const d = selectSizeDisplay({ actualCompressedSize: null, livePreview, liveFailed });
        expect(d.kind).not.toBe("actual");
      }
    }
  });
});
