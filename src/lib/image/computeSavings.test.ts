import { describe, it, expect } from "vitest";
import { computeSavings, savingsPctText } from "./computeSavings";

describe("computeSavings", () => {
  it("computes saved bytes and percent for a normal reduction", () => {
    expect(computeSavings(100, 25)).toEqual({ saved: 75, pct: 75 });
  });

  it("returns zero percent when the original size is 0", () => {
    expect(computeSavings(0, 0)).toEqual({ saved: 0, pct: 0 });
  });

  it("returns a negative percent when the output grew", () => {
    expect(computeSavings(100, 150)).toEqual({ saved: -50, pct: -50 });
  });

  it("rounds the percent to the nearest integer", () => {
    expect(computeSavings(1000, 333)).toEqual({ saved: 667, pct: 67 });
  });
});

describe("savingsPctText", () => {
  const UNDER = "under 1%";

  it("shows a whole percent", () => {
    expect(savingsPctText(computeSavings(100, 25), UNDER)).toBe("75%");
  });

  it("shows 'under 1%' when a file shrank by a few bytes", () => {
    expect(savingsPctText(computeSavings(10_500_000, 10_499_997), UNDER)).toBe(UNDER);
  });

  it("shows 'under 1%' up to the rounding edge, then 1%", () => {
    expect(savingsPctText(computeSavings(1000, 996), UNDER)).toBe(UNDER);
    expect(savingsPctText(computeSavings(1000, 995), UNDER)).toBe("1%");
  });

  it("shows 0% when nothing was saved", () => {
    expect(savingsPctText(computeSavings(100, 100), UNDER)).toBe("0%");
    expect(savingsPctText(computeSavings(0, 0), UNDER)).toBe("0%");
  });

  describe("signed", () => {
    it("marks a saving with - and growth with +", () => {
      expect(savingsPctText(computeSavings(100, 25), UNDER, { signed: true })).toBe("-75%");
      expect(savingsPctText(computeSavings(100, 150), UNDER, { signed: true })).toBe("+50%");
      expect(savingsPctText(computeSavings(100, 100), UNDER, { signed: true })).toBe("±0%");
    });

    it("shows 'under 1%' instead of ±0% when a file shrank by a few bytes", () => {
      expect(savingsPctText(computeSavings(10_500_000, 10_499_997), UNDER, { signed: true })).toBe(UNDER);
    });
  });
});
