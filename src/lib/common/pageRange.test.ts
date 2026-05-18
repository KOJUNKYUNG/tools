import { describe, expect, it } from "vitest";
import { parseRange, serializeRange } from "./pageRange";

describe("parseRange", () => {
  it("returns empty Set for empty input", () => {
    expect(parseRange("", 10)).toEqual(new Set());
  });

  it("returns empty Set when totalPages <= 0", () => {
    expect(parseRange("1, 2, 3", 0)).toEqual(new Set());
    expect(parseRange("1", -5)).toEqual(new Set());
  });

  it("parses comma-separated singletons", () => {
    expect(parseRange("1, 3, 5", 10)).toEqual(new Set([1, 3, 5]));
  });

  it("parses ranges", () => {
    expect(parseRange("2-5", 10)).toEqual(new Set([2, 3, 4, 5]));
  });

  it("parses mixed singletons and ranges", () => {
    expect(parseRange("1, 3-5, 8", 10)).toEqual(new Set([1, 3, 4, 5, 8]));
  });

  it("normalises reversed ranges", () => {
    expect(parseRange("5-3", 10)).toEqual(new Set([3, 4, 5]));
  });

  it("clamps ranges to [1, totalPages]", () => {
    expect(parseRange("0-3", 5)).toEqual(new Set([1, 2, 3]));
    expect(parseRange("4-99", 5)).toEqual(new Set([4, 5]));
  });

  it("drops singletons outside [1, totalPages]", () => {
    expect(parseRange("0, 3, 99", 5)).toEqual(new Set([3]));
  });

  it("deduplicates overlapping tokens", () => {
    expect(parseRange("1, 1, 2-3, 3", 10)).toEqual(new Set([1, 2, 3]));
  });

  it("drops invalid tokens silently", () => {
    expect(parseRange("1, abc, 3, 2-x, 5", 10)).toEqual(new Set([1, 3, 5]));
  });

  it("accepts newline separators", () => {
    expect(parseRange("1\n3\n5-6", 10)).toEqual(new Set([1, 3, 5, 6]));
  });

  it("tolerates whitespace around tokens and dashes", () => {
    expect(parseRange("  1 ,  3 - 5  , 8  ", 10)).toEqual(new Set([1, 3, 4, 5, 8]));
  });
});

describe("serializeRange", () => {
  it("returns empty string for empty Set", () => {
    expect(serializeRange(new Set())).toBe("");
  });

  it("serializes a single index", () => {
    expect(serializeRange(new Set([4]))).toBe("4");
  });

  it("serializes disjoint singletons sorted", () => {
    expect(serializeRange(new Set([5, 1, 3]))).toBe("1, 3, 5");
  });

  it("collapses contiguous runs", () => {
    expect(serializeRange(new Set([1, 2, 3, 4]))).toBe("1-4");
  });

  it("mixes runs and singletons", () => {
    expect(serializeRange(new Set([1, 3, 4, 5, 8]))).toBe("1, 3-5, 8");
  });

  it("filters non-finite values", () => {
    expect(serializeRange(new Set([1, Number.NaN, 3, Number.POSITIVE_INFINITY]))).toBe("1, 3");
  });
});

describe("parseRange <-> serializeRange round-trip", () => {
  it("round-trips canonical forms", () => {
    const cases = ["1", "1, 3, 5", "1-4", "1, 3-5, 8", "2-5, 7, 9-10"];
    for (const input of cases) {
      const parsed = parseRange(input, 100);
      expect(serializeRange(parsed)).toBe(input);
    }
  });

  it("canonicalises non-canonical inputs through round-trip", () => {
    expect(serializeRange(parseRange("3, 1, 2, 5, 4", 10))).toBe("1-5");
    expect(serializeRange(parseRange("5-3, 1", 10))).toBe("1, 3-5");
  });
});
