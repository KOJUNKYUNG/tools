import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { headerOnlyImage } from "@/lib/image/slideImageStandIn";
import { JPEG_3x2, noisePng, solidPng, withExifOrientation, withJpegSize } from "@/lib/pdf/testImages";
import { assemblePptxFromPlaced, type AssembleOptions, type PlacedImage } from "./assemblePptx";
import { checkImageToPptx } from "./imageToPptxCheck";

const dataUrl = (bytes: Uint8Array) =>
  `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;

// Distinct images, so a slide pointing at the wrong one is detectable.
const IMAGES: PlacedImage[] = [solidPng(1, 1), solidPng(2, 1), solidPng(3, 1)].map((png) => ({
  dataUrl: dataUrl(png),
  placement: { x: 1, y: 1, w: 4, h: 3 },
}));
const COLOR: AssembleOptions = { slideKind: "16:9", screen: "full-hd", background: { kind: "color", color: "FFFFFF" } };
const IMAGE_BG: AssembleOptions = {
  slideKind: "4:3",
  screen: "full-hd",
  background: { kind: "image", dataUrl: dataUrl(solidPng(4, 3)) },
};

/** One slide showing `bytes`, as the engine would have placed them. */
const onePicture = (bytes: Uint8Array, format: "png" | "jpeg" = "png"): PlacedImage[] => [
  {
    dataUrl: `data:image/${format};base64,${Buffer.from(bytes).toString("base64")}`,
    placement: { x: 1, y: 1, w: 4, h: 3 },
  },
];

const sized = (format: "png" | "jpeg", width: number, height: number) =>
  headerOnlyImage(format, { width, height }, new Uint8Array([1]));

/** Replaces a part's bytes, as a tool writing the wrong picture would. */
async function withPart(deck: Uint8Array, part: string, bytes: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(deck);
  zip.file(part, bytes);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

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

  it("flags a slide picture whose bytes do not match its part's extension, at full depth only", async () => {
    const jpeg = sized("jpeg", 40, 30);
    const images = onePicture(sized("png", 40, 30));
    const deck = await assemblePptxFromPlaced(images, COLOR);
    expect(await checkImageToPptx(images, COLOR, deck, "full")).toEqual([]);

    // A JPEG under a .png name, with the engine's input saying the same bytes.
    const edited = await withPart(deck, "ppt/media/image-1-1.png", jpeg);
    const placed = onePicture(jpeg);

    expect(await checkImageToPptx(placed, COLOR, edited, "quick")).toEqual([]);
    expect(await checkImageToPptx(placed, COLOR, edited, "full")).toEqual([
      { property: "slide-image-header", detail: "ppt/media/image-1-1.png: holds jpeg" },
    ]);
  });

  it("flags a slide picture part holding unreadable bytes", async () => {
    const images = onePicture(sized("png", 40, 30));
    const garbage = new Uint8Array([1, 2, 3, 4]);
    const edited = await withPart(await assemblePptxFromPlaced(images, COLOR), "ppt/media/image-1-1.png", garbage);

    expect(await checkImageToPptx(onePicture(garbage), COLOR, edited, "full")).toEqual([
      { property: "slide-image-header", detail: "ppt/media/image-1-1.png: holds unreadable bytes" },
    ]);
  });

  it.each([
    ["16:9", "full-hd", 1920, 1080],
    ["4:3", "full-hd", 1440, 1080],
    ["16:9", "4k", 3840, 2160],
    ["4:3", "4k", 2880, 2160],
  ] as const)("accepts a picture filling a %s slide on %s, and flags a pixel more, at full depth only", async (slideKind, screen, width, height) => {
    const opts: AssembleOptions = { slideKind, screen, background: { kind: "color", color: "FFFFFF" } };
    const fits = onePicture(sized("png", width, height));
    expect(await checkImageToPptx(fits, opts, await assemblePptxFromPlaced(fits, opts), "full")).toEqual([]);

    // A deck edited to carry more pixels than the screen shows, side by side.
    for (const [w, h] of [[width + 1, height], [width, height + 1]]) {
      const big = sized("png", w, h);
      const edited = await withPart(
        await assemblePptxFromPlaced(fits, opts),
        "ppt/media/image-1-1.png",
        big,
      );
      expect(await checkImageToPptx(onePicture(big), opts, edited, "quick")).toEqual([]);
      expect(await checkImageToPptx(onePicture(big), opts, edited, "full")).toEqual([
        {
          property: "screen-size",
          detail: `ppt/media/image-1-1.png: ${w} × ${h} on a ${width} × ${height} slide`,
        },
      ]);
    }
  });

  it("flags a picture over the screen size by the size it shows, not as stored", async () => {
    // Stored within Full HD's 1080 height only because the turn is not applied.
    const turned = withExifOrientation(withJpegSize(JPEG_3x2, 1200, 1000), 6);
    const placed = onePicture(turned, "jpeg");
    const deck = await assemblePptxFromPlaced(placed, COLOR);

    expect(await checkImageToPptx(placed, COLOR, deck, "full")).toEqual([
      { property: "screen-size", detail: "ppt/media/image-1-1.jpeg: 1000 × 1200 on a 1920 × 1080 slide" },
    ]);
  });

  it("flags a background part whose bytes do not match its extension, at full depth only", async () => {
    // What pptxgenjs writes given only `data` (#74): a JPEG under a .png name.
    const jpeg = `data:image/jpeg;base64,${Buffer.from(JPEG_3x2).toString("base64")}`;
    const opts: AssembleOptions = { slideKind: "16:9", screen: "full-hd", background: { kind: "image", dataUrl: jpeg } };
    const pptx = new PptxGenJS();
    pptx.defineSlideMaster({ title: "BG", background: { data: jpeg } });
    for (const img of IMAGES) pptx.addSlide({ masterName: "BG" }).addImage({ data: img.dataUrl, ...img.placement });
    // write() returns a union over every outputType; "uint8array" yields this one.
    const deck = (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
    expect(await checkImageToPptx(IMAGES, opts, deck, "quick")).toEqual([]);
    expect(await checkImageToPptx(IMAGES, opts, deck, "full")).toEqual([
      { property: "background-header", detail: "ppt/media/BG-image-1.png: holds jpeg" },
    ]);
  });

  it("flags a background stored once per slide (size bound)", async () => {
    // The bloat assemblePptx's slide master exists to avoid: every slide
    // declares, and so embeds, its own copy of the background.
    const background = dataUrl(noisePng(200, 150));
    const opts: AssembleOptions = { slideKind: "16:9", screen: "full-hd", background: { kind: "image", dataUrl: background } };
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
