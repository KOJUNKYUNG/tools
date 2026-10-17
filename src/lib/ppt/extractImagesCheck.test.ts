import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { JPEG_3x2, solidPng } from "@/lib/pdf/testImages";
import { extractPptImages } from "./extractImages";
import { checkPptExtract } from "./extractImagesCheck";

/** A .pptx holding two images, a video and a slide part. */
async function syntheticDeck(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("ppt/slides/slide1.xml", "<p:sld/>");
  zip.file("ppt/media/image1.png", solidPng(4, 3));
  zip.file("ppt/media/image2.jpg", JPEG_3x2);
  zip.file("ppt/media/media1.mp4", new Uint8Array([0, 0, 0, 0x18]));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

const extract = (bytes: Uint8Array, name = "deck.pptx") =>
  extractPptImages({ file: new File([new Uint8Array(bytes)], name) });

const properties = (violations: { property: string }[]) => violations.map((v) => v.property);

describe("checkPptExtract (.pptx)", () => {
  it("finds nothing wrong in a good extraction, at both depths", async () => {
    const deck = await syntheticDeck();
    const images = await extract(deck);
    expect(await checkPptExtract(deck, undefined, images, "quick")).toEqual([]);
    expect(await checkPptExtract(deck, undefined, images, "full")).toEqual([]);
  });

  it("flags bytes altered from the embedded source, at full depth only", async () => {
    const deck = await syntheticDeck();
    const images = await extract(deck);
    const altered = images.map((img, i) =>
      i === 0 ? { ...img, data: Uint8Array.from(img.data, (b, j) => (j === 30 ? b ^ 1 : b)) } : img,
    );
    expect(await checkPptExtract(deck, undefined, altered, "quick")).toEqual([]);
    expect(properties(await checkPptExtract(deck, undefined, altered, "full"))).toEqual([
      "bytes-identical",
    ]);
  });

  it("flags truncated bytes", async () => {
    const deck = await syntheticDeck();
    const images = await extract(deck);
    const truncated = images.map((img) => ({ ...img, data: img.data.subarray(0, 10) }));
    expect(properties(await checkPptExtract(deck, undefined, truncated, "full"))).toEqual([
      "bytes-identical",
      "bytes-identical",
    ]);
  });

  it("flags a missing image at quick depth", async () => {
    const deck = await syntheticDeck();
    const images = await extract(deck);
    expect(
      properties(await checkPptExtract(deck, undefined, images.slice(1), "quick")),
    ).toEqual(["image-count"]);
  });

  it("flags a hole left in the result list", async () => {
    const deck = await syntheticDeck();
    const images = await extract(deck);
    const holed = [...images];
    delete holed[1];
    expect(properties(await checkPptExtract(deck, undefined, holed, "quick"))).toEqual([
      "image-count",
    ]);
  });

  it("does not check headers: a misnamed image in the deck is copied as it is", async () => {
    const zip = new JSZip();
    zip.file("ppt/media/image1.png", JPEG_3x2);
    const deck = await zip.generateAsync({ type: "uint8array" });
    const images = await extract(deck);
    expect(await checkPptExtract(deck, undefined, images, "full")).toEqual([]);
  });
});
