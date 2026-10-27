import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { changeBackground, type BgMode, type NewBackground } from "./changeBackground";
import { picture, pictureBackground, testDeck, textBox, type TestLayout, type TestSlide } from "./testDeck";

// Solid colour and "no background" are written as PowerPoint fills: no
// picture is decoded or prepared, so these runs need no Image stand-in.

const NAVY: NewBackground = { kind: "colour", rgb: "1F2A44" };

async function apply(
  slides: TestSlide[],
  background: NewBackground,
  options: { mode?: BgMode; targetSlides?: number[]; layout?: TestLayout } = {},
): Promise<JSZip> {
  const deck = await testDeck(slides, options.layout);
  const output = await changeBackground({
    pptxFile: new File([new Uint8Array(deck)], "deck.pptx"),
    background,
    mode: options.mode ?? "all-slides",
    targetSlides: options.targetSlides,
  });
  return JSZip.loadAsync(output);
}

const text = (zip: JSZip, part: string) => zip.file(part)!.async("text");
const ownBackground = async (zip: JSZip, part: string) => (await text(zip, part)).match(/<p:bg>[\s\S]*?<\/p:bg>/)?.[0];
const mediaParts = (zip: JSZip) =>
  Object.keys(zip.files)
    .filter((p) => p.startsWith("ppt/media/") && !zip.files[p].dir)
    .sort();

const lyrics = textBox(9, "주 하나님 지으신 모든 세계");

describe("changeBackground with a solid colour", () => {
  it("paints each slide with the colour, deleting the picture it replaces and adding none", async () => {
    const zip = await apply(
      [
        { shapes: [lyrics] },
        { shapes: [lyrics], background: pictureBackground("rId10"), pictures: { rId10: "old.png" } },
      ],
      NAVY,
    );

    for (const n of [1, 2]) {
      expect(await ownBackground(zip, `ppt/slides/slide${n}.xml`)).toContain(
        '<a:solidFill><a:srgbClr val="1F2A44"/></a:solidFill>',
      );
    }
    expect(await text(zip, "ppt/slides/_rels/slide2.xml.rels")).not.toContain("old.png");
    expect(mediaParts(zip)).toEqual([]);
  });

  it("rejects a colour that is not six hex digits, which PowerPoint could not open", async () => {
    for (const rgb of ["#1F2A44", "1F2A4", "navy"]) {
      await expect(apply([{ shapes: [lyrics] }], { kind: "colour", rgb })).rejects.toThrow(/colour/);
    }
  });
});

describe("changeBackground with no background", () => {
  it("gives each slide the theme's background colour, so a picture its layout carries stays hidden", async () => {
    const zip = await apply(
      [{ shapes: [lyrics], background: pictureBackground("rId10"), pictures: { rId10: "old.png" } }],
      { kind: "none" },
      { layout: { background: pictureBackground("rId20"), pictures: { rId20: "layout.png" } } },
    );

    expect(await ownBackground(zip, "ppt/slides/slide1.xml")).toContain(
      '<a:solidFill><a:schemeClr val="bg1"/></a:solidFill>',
    );
    expect(mediaParts(zip)).toEqual(["ppt/media/layout.png"]);
  });
});

describe("solid colour and no background follow the apply scope", () => {
  it("in master mode, the master takes the theme colour and layouts and slides lose their own backgrounds", async () => {
    const zip = await apply(
      [{ shapes: [lyrics], background: pictureBackground("rId10"), pictures: { rId10: "old.png" } }],
      { kind: "none" },
      { mode: "master", layout: { background: pictureBackground("rId20"), pictures: { rId20: "layout.png" } } },
    );

    expect(await ownBackground(zip, "ppt/slideMasters/slideMaster1.xml")).toContain(
      '<a:solidFill><a:schemeClr val="bg1"/></a:solidFill>',
    );
    expect(await ownBackground(zip, "ppt/slideLayouts/slideLayout1.xml")).toBeUndefined();
    expect(await ownBackground(zip, "ppt/slides/slide1.xml")).toBeUndefined();
    expect(mediaParts(zip)).toEqual([]);
  });

  it("on selected slides, deletes their covering pictures and leaves the other slides as they were", async () => {
    const zip = await apply(
      [
        { shapes: [picture(2, "rId10"), lyrics], pictures: { rId10: "a.png" } },
        { shapes: [picture(2, "rId10"), lyrics], pictures: { rId10: "b.png" } },
      ],
      NAVY,
      { mode: "specific-slides", targetSlides: [2] },
    );

    expect(await text(zip, "ppt/slides/slide1.xml")).toContain("<p:pic>");
    expect(await ownBackground(zip, "ppt/slides/slide1.xml")).toBeUndefined();
    expect(await text(zip, "ppt/slides/slide2.xml")).not.toContain("<p:pic>");
    expect(await text(zip, "ppt/slides/slide2.xml")).toContain("주 하나님");
    expect(await ownBackground(zip, "ppt/slides/slide2.xml")).toContain('<a:srgbClr val="1F2A44"/>');
    expect(mediaParts(zip)).toEqual(["ppt/media/a.png"]);
  });
});
