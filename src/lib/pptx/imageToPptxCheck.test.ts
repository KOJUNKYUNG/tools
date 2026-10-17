import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { noisePng, solidPng } from "@/lib/pdf/testImages";
import { assemblePptxFromPlaced, type AssembleOptions, type PlacedImage } from "./assemblePptx";
import { checkImageToPptx } from "./imageToPptxCheck";

const dataUrl = (bytes: Uint8Array) =>
  `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;

// Distinct images, so a slide pointing at the wrong one is detectable.
const IMAGES: PlacedImage[] = [solidPng(1, 1), solidPng(2, 1), solidPng(3, 1)].map((png) => ({
  dataUrl: dataUrl(png),
  placement: { x: 1, y: 1, w: 4, h: 3 },
}));
const COLOR: AssembleOptions = { slideKind: "16:9", background: { kind: "color", color: "FFFFFF" } };
const IMAGE_BG: AssembleOptions = {
  slideKind: "4:3",
  background: { kind: "image", dataUrl: dataUrl(solidPng(4, 3)) },
};

/** Rewrites parts of a deck; a null edit removes the part. */
async function edit(
  deck: Uint8Array,
  edits: Record<string, ((xml: string) => string) | null>,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(deck);
  for (const [part, change] of Object.entries(edits)) {
    if (change === null) {
      zip.remove(part);
      continue;
    }
    const file = zip.file(part);
    if (!file) throw new Error(`no part ${part}`);
    zip.file(part, change(await file.async("text")));
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

const props = (vs: { property: string }[]) => vs.map((v) => v.property);

describe("checkImageToPptx", () => {
  it.each([
    ["a color background", COLOR],
    ["an image background", IMAGE_BG],
  ])("finds nothing wrong with a deck on %s", async (_label, opts) => {
    const deck = await assemblePptxFromPlaced(IMAGES, opts);
    expect(await checkImageToPptx(IMAGES, opts, deck, "quick")).toEqual([]);
    expect(await checkImageToPptx(IMAGES, opts, deck, "full")).toEqual([]);
  });

  it("flags output that is not a zip", async () => {
    const out = await checkImageToPptx(IMAGES, COLOR, new Uint8Array([1, 2, 3]), "quick");
    expect(props(out)).toEqual(["zip"]);
  });

  it("flags a missing slide at quick depth", async () => {
    const deck = await assemblePptxFromPlaced(IMAGES.slice(0, 2), COLOR);
    const out = await checkImageToPptx(IMAGES, COLOR, deck, "quick");
    expect(out).toContainEqual({ property: "slide-count", detail: "3 images → 2 slides" });
  });

  it("flags a structural defect at quick depth", async () => {
    const deck = await edit(await assemblePptxFromPlaced(IMAGES, COLOR), {
      "ppt/slides/slide2.xml": (xml) => xml.replace("</p:sld>", ""),
    });
    expect(props(await checkImageToPptx(IMAGES, COLOR, deck, "quick"))).toEqual([
      "xml-well-formed",
    ]);
  });

  it("flags a slide showing another slide's image, at full depth only", async () => {
    const deck = await edit(await assemblePptxFromPlaced(IMAGES, COLOR), {
      "ppt/slides/_rels/slide1.xml.rels": (xml) =>
        xml.replace("../media/image-1-1.png", "../media/image-2-1.png"),
    });
    expect(await checkImageToPptx(IMAGES, COLOR, deck, "quick")).toEqual([]);
    expect(props(await checkImageToPptx(IMAGES, COLOR, deck, "full"))).toEqual(["slide-image"]);
  });

  it("flags a slide that shows no image", async () => {
    const deck = await edit(await assemblePptxFromPlaced(IMAGES, COLOR), {
      "ppt/slides/slide3.xml": (xml) => xml.replace(/<p:pic>[\s\S]*<\/p:pic>/, ""),
    });
    expect(await checkImageToPptx(IMAGES, COLOR, deck, "full")).toEqual([
      { property: "slide-image", detail: "ppt/slides/slide3.xml: shows 0 images" },
    ]);
  });

  it("flags slides that do not inherit the chosen background image", async () => {
    const deck = await edit(await assemblePptxFromPlaced(IMAGES, IMAGE_BG), {
      "ppt/slideLayouts/slideLayout2.xml": (xml) =>
        xml.replace(/<p:bg>[\s\S]*?<\/p:bg>/, ""),
    });
    expect(await checkImageToPptx(IMAGES, IMAGE_BG, deck, "quick")).toEqual([]);
    expect(props(await checkImageToPptx(IMAGES, IMAGE_BG, deck, "full"))).toEqual([
      "slide-background",
      "slide-background",
      "slide-background",
    ]);
  });

  it("flags a background stored once per slide (size bound)", async () => {
    // The bloat assemblePptx's slide master exists to avoid: every slide
    // declares, and so embeds, its own copy of the background.
    const background = dataUrl(noisePng(200, 150));
    const opts: AssembleOptions = { slideKind: "16:9", background: { kind: "image", dataUrl: background } };
    const pptx = new PptxGenJS();
    for (const img of IMAGES) {
      const slide = pptx.addSlide();
      slide.background = { data: background };
      slide.addImage({ data: img.dataUrl, ...img.placement });
    }
    // write() returns a union over every outputType; "uint8array" yields this one.
    const deck = (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
    expect(props(await checkImageToPptx(IMAGES, opts, deck, "full"))).toContain("size-bound");
  });
});
