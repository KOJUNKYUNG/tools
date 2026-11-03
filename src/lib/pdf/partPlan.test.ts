import { describe, expect, it } from "vitest";
import { planParts, shouldClosePart } from "./partPlan";

describe("shouldClosePart", () => {
  it("does not close below target", () => {
    expect(shouldClosePart(50, 100, 3)).toBe(false);
  });
  it("closes at/over target when pages remain", () => {
    expect(shouldClosePart(100, 100, 1)).toBe(true);
    expect(shouldClosePart(120, 100, 5)).toBe(true);
  });
  it("never closes when no pages remain (last page)", () => {
    expect(shouldClosePart(100, 100, 0)).toBe(false);
    expect(shouldClosePart(999, 100, 0)).toBe(false);
  });
});

describe("planParts", () => {
  it("keeps everything in one part when total stays under target", () => {
    expect(planParts([10, 10, 10], 100)).toEqual([[0, 1, 2]]);
  });
  it("splits when the running total crosses target mid-job", () => {
    expect(planParts([60, 60, 60], 100)).toEqual([[0, 1], [2]]);
  });
  it("stays a single part when target is hit exactly on the last page", () => {
    expect(planParts([50, 50], 100)).toEqual([[0, 1]]);
  });
  it("splits when target is hit exactly but pages remain", () => {
    expect(planParts([50, 50, 50], 100)).toEqual([[0, 1], [2]]);
  });
  it("handles a single oversized page as one part", () => {
    expect(planParts([500], 100)).toEqual([[0]]);
  });
});
