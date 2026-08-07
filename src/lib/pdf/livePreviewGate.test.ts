import { describe, expect, it } from "vitest";
import { shouldPreviewCompress } from "./livePreviewGate";

describe("shouldPreviewCompress", () => {
  it("runs the live whole-doc compress at or below the limit", () => {
    expect(shouldPreviewCompress(5_000_000, 20_000_000)).toBe(true);
    expect(shouldPreviewCompress(20_000_000, 20_000_000)).toBe(true);
  });
  it("skips the live compress above the limit (avoids churning huge files)", () => {
    expect(shouldPreviewCompress(20_000_001, 20_000_000)).toBe(false);
  });
});
