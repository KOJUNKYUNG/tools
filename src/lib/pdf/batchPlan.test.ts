import { describe, expect, it } from "vitest";
import { planBatches, shouldFlush } from "./batchPlan";

describe("shouldFlush", () => {
  it("does not flush below target", () => {
    expect(shouldFlush(50, 100, 3)).toBe(false);
  });
  it("flushes at/over target when pages remain", () => {
    expect(shouldFlush(100, 100, 1)).toBe(true);
    expect(shouldFlush(120, 100, 5)).toBe(true);
  });
  it("never flushes when no pages remain (last page)", () => {
    expect(shouldFlush(100, 100, 0)).toBe(false);
    expect(shouldFlush(999, 100, 0)).toBe(false);
  });
});

describe("planBatches", () => {
  it("keeps everything in one batch when total stays under target", () => {
    expect(planBatches([10, 10, 10], 100)).toEqual([[0, 1, 2]]);
  });
  it("splits when the running total crosses target mid-job", () => {
    expect(planBatches([60, 60, 60], 100)).toEqual([[0, 1], [2]]);
  });
  it("stays a single batch when target is hit exactly on the last page", () => {
    expect(planBatches([50, 50], 100)).toEqual([[0, 1]]);
  });
  it("splits when target is hit exactly but pages remain", () => {
    expect(planBatches([50, 50, 50], 100)).toEqual([[0, 1], [2]]);
  });
  it("handles a single oversized page as one batch", () => {
    expect(planBatches([500], 100)).toEqual([[0]]);
  });
});
