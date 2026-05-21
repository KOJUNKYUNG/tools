import { describe, it, expect } from "vitest";
import { formatBytes } from "./formatBytes";

describe("formatBytes", () => {
  it("returns '0 B' for zero", () => {
    expect(formatBytes(0)).toBe("0 B");
  });
  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });
  it("formats kilobytes with one decimal", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1 MB");
  });
  it("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1 GB");
  });
});
