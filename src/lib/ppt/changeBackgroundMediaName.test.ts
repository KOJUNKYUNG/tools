import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { uniqueMediaName } from "./changeBackground";

describe("uniqueMediaName", () => {
  it("returns the base name when no background media exists yet", () => {
    const zip = new JSZip();
    expect(uniqueMediaName(zip, "png")).toBe("background_custom.png");
  });

  it("does NOT collide with a background from a previous run (the reason a second apply used to bleed onto already-changed slides)", () => {
    const zip = new JSZip();
    zip.file("ppt/media/background_custom.png", "old");
    expect(uniqueMediaName(zip, "png")).toBe("background_custom_1.png");
  });

  it("keeps incrementing past multiple existing backgrounds", () => {
    const zip = new JSZip();
    zip.file("ppt/media/background_custom.png", "a");
    zip.file("ppt/media/background_custom_1.png", "b");
    expect(uniqueMediaName(zip, "png")).toBe("background_custom_2.png");
  });

  it("keys off the extension", () => {
    const zip = new JSZip();
    zip.file("ppt/media/background_custom.png", "a");
    expect(uniqueMediaName(zip, "jpeg")).toBe("background_custom.jpeg");
  });
});
