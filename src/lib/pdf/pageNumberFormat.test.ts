import { describe, it, expect } from "vitest";
import { formatPageNumber, PAGE_NUMBER_FORMATS } from "./pageNumberFormat";

describe("formatPageNumber", () => {
  it("plain shows the displayed number (start offset applied)", () => {
    expect(formatPageNumber({ index: 0, total: 10, start: 1, format: "plain" })).toBe("1");
    expect(formatPageNumber({ index: 2, total: 10, start: 1, format: "plain" })).toBe("3");
    expect(formatPageNumber({ index: 0, total: 10, start: 5, format: "plain" })).toBe("5");
  });
  it("fraction shows displayed number over the page count", () => {
    expect(formatPageNumber({ index: 0, total: 10, start: 1, format: "fraction" })).toBe("1 / 10");
    expect(formatPageNumber({ index: 9, total: 10, start: 1, format: "fraction" })).toBe("10 / 10");
  });
  it("dash wraps the number", () => {
    expect(formatPageNumber({ index: 1, total: 3, start: 1, format: "dash" })).toBe("- 2 -");
  });
  it("ko appends the default 쪽 suffix (Korean glyph survives — canvas path)", () => {
    expect(formatPageNumber({ index: 0, total: 3, start: 1, format: "ko" })).toBe("1쪽");
  });
  it("ko uses a locale-supplied suffix (e.g. 'p' for English)", () => {
    expect(formatPageNumber({ index: 0, total: 3, start: 1, format: "ko", suffix: "p" })).toBe("1p");
    expect(formatPageNumber({ index: 4, total: 9, start: 1, format: "ko", suffix: "쪽" })).toBe("5쪽");
  });
  it("suffix is ignored by non-suffix formats", () => {
    expect(formatPageNumber({ index: 0, total: 3, start: 1, format: "plain", suffix: "p" })).toBe("1");
  });
  it("exposes the format list for the controls", () => {
    expect(PAGE_NUMBER_FORMATS).toContain("plain");
    expect(PAGE_NUMBER_FORMATS).toContain("fraction");
    expect(PAGE_NUMBER_FORMATS).toContain("dash");
    expect(PAGE_NUMBER_FORMATS).toContain("ko");
  });
});
