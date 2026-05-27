import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildExtractZip } from "./buildExtractZip";
import type { ExtractedImage } from "./extractImages";

function img(name: string, bytes: number[]): ExtractedImage {
  const data = new Uint8Array(bytes);
  return { name, data, mime: "application/octet-stream", size: data.length };
}

describe("buildExtractZip", () => {
  it("throws on empty input", async () => {
    await expect(buildExtractZip([])).rejects.toThrow();
  });

  it("packages images with their original names", async () => {
    const zipped = await buildExtractZip([
      img("a.png", [1, 2, 3]),
      img("b.jpg", [9, 8, 7, 6]),
    ]);
    const zip = await JSZip.loadAsync(zipped);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(["a.png", "b.jpg"]);
    const aBytes = await zip.files["a.png"].async("uint8array");
    expect(Array.from(aBytes)).toEqual([1, 2, 3]);
  });

  it("preserves duplicate names by sequence suffix", async () => {
    const zipped = await buildExtractZip([
      img("dup.png", [1]),
      img("dup.png", [2]),
    ]);
    const zip = await JSZip.loadAsync(zipped);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(["dup (2).png", "dup.png"]);
  });
});
