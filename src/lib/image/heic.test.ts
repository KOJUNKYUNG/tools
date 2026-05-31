import { describe, it, expect } from "vitest";
import { isHeicFile } from "./heic";
function f(name: string, type = ""): File { return new File([new Uint8Array([1])], name, { type }); }
describe("isHeicFile", () => {
  it("detects .heic / .HEIC by extension", () => {
    expect(isHeicFile(f("photo.heic"))).toBe(true);
    expect(isHeicFile(f("PHOTO.HEIC"))).toBe(true);
  });
  it("detects .heif", () => { expect(isHeicFile(f("x.heif"))).toBe(true); });
  it("detects by mime even with non-heic name", () => {
    expect(isHeicFile(f("blob", "image/heic"))).toBe(true);
    expect(isHeicFile(f("blob", "image/heif"))).toBe(true);
  });
  it("detects .heic with empty mime (Windows)", () => { expect(isHeicFile(f("a.heic", ""))).toBe(true); });
  it("returns false for jpg/png/webp", () => {
    expect(isHeicFile(f("a.jpg", "image/jpeg"))).toBe(false);
    expect(isHeicFile(f("a.png", "image/png"))).toBe(false);
    expect(isHeicFile(f("a.webp", "image/webp"))).toBe(false);
  });
});
