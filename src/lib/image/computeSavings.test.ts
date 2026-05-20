import { describe, it, expect } from "vitest";
import { computeSavings } from "./computeSavings";

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
