import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractCurrentBackgrounds } from "./extractCurrentBackgrounds";
import { groupBackgrounds } from "./groupBackgrounds";
import {
  filledShape,
  gradientFill,
  group,
  picture,
  pictureBackground,
  pictureShape,
  solidBackground,
  solidFill,
  testDeck,
  textBox,
} from "./testDeck";

/** The visible-background groups of a deck, as the preview shows them. */
async function analyse(deck: Uint8Array) {
  return groupBackgrounds(await extractCurrentBackgrounds(new File([new Uint8Array(deck)], "deck.pptx")));
}

const blobs = group(2, { x: -500000, y: -300000, w: 10000000, h: 6000000 }, [
  pictureShape(3, "rId20", { x: 0, y: 0, w: 4000000, h: 4000000 }),
  pictureShape(4, "rId21", { x: 5000000, y: 1000000, w: 4000000, h: 4000000 }),
]);

describe("extractCurrentBackgrounds reports each slide's visible background", () => {
  it("reports covering backgrounds, grouped by the picture parts they use", async () => {
    const deck = await testDeck([
      { shapes: [picture(2, "rId10"), textBox(9, "1절")], pictures: { rId10: "photo.png" } },
      // The same picture part under another relationship id.
      { shapes: [pictureShape(2, "rId30"), textBox(9, "2절")], pictures: { rId30: "photo.png" } },
      {
        shapes: [blobs, textBox(9, "후렴")],
        pictures: { rId20: "blob1.png", rId21: "blob2.png" },
      },
      { shapes: [textBox(9, "광고")] },
      // A lone sheet-music picture is content, not a background.
      { shapes: [picture(2, "rId10")], pictures: { rId10: "score.png" } },
    ]);
    const groups = await analyse(deck);

    expect(groups.map(({ key, source, slideIndexes }) => ({ key, source, slideIndexes }))).toEqual([
      { key: "covering:ppt/media/photo.png", source: "covering", slideIndexes: [1, 2] },
      { key: "covering:ppt/media/blob1.png|ppt/media/blob2.png", source: "covering", slideIndexes: [3] },
      // The test deck's layout fills its background from the theme (Background 1: white).
      { key: "colour:#ffffff", source: "layout", slideIndexes: [4, 5] },
    ]);

    // The thumbnail is the bottom-most covering element's (first) picture.
    const zip = await JSZip.loadAsync(deck);
    const bytes = (part: string) => zip.file(part)!.async("uint8array");
    expect(new Uint8Array(await groups[0].imageBlob!.arrayBuffer())).toEqual(await bytes("ppt/media/photo.png"));
    expect(new Uint8Array(await groups[1].imageBlob!.arrayBuffer())).toEqual(await bytes("ppt/media/blob1.png"));
  });

  it("keys a covering group by its set of picture parts, whatever their order", async () => {
    const swapped = group(2, { x: -500000, y: -300000, w: 10000000, h: 6000000 }, [
      pictureShape(3, "rId21", { x: 0, y: 0, w: 4000000, h: 4000000 }),
      pictureShape(4, "rId20", { x: 5000000, y: 1000000, w: 4000000, h: 4000000 }),
    ]);
    const pictures = { rId20: "blob1.png", rId21: "blob2.png" };
    const groups = await analyse(
      await testDeck([
        { shapes: [blobs, textBox(9, "1")], pictures },
        { shapes: [swapped, textBox(9, "2")], pictures },
      ]),
    );
    expect(groups.map((g) => [g.key, g.slideIndexes])).toEqual([
      ["covering:ppt/media/blob1.png|ppt/media/blob2.png", [1, 2]],
    ]);
  });
});

describe("extractCurrentBackgrounds shows fills as colour swatches", () => {
  const lyrics = textBox(9, "가사");

  it("groups slides by their solid background's resolved colour, theme colours included", async () => {
    const themeBlue = `<p:bg><p:bgPr><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
    const darker15 = `<p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"><a:lumMod val="85000"/></a:schemeClr></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
    const groups = await analyse(
      await testDeck([
        { shapes: [lyrics], background: solidBackground("1F2D3A") },
        // The Office theme's Accent 1.
        { shapes: [lyrics], background: themeBlue },
        { shapes: [lyrics], background: solidBackground("4472C4") },
        // PowerPoint's "White, Background 1, Darker 15%".
        { shapes: [lyrics], background: darker15 },
        { shapes: [lyrics], background: `<p:bg><p:bgPr>${gradientFill(["<a:srgbClr val=\"FFFFFF\"/>", "<a:srgbClr val=\"000000\"/>"])}<a:effectLst/></p:bgPr></p:bg>` },
        { shapes: [lyrics] },
      ]),
    );
    expect(groups.map(({ key, source, swatch, slideIndexes }) => ({ key, source, swatch, slideIndexes }))).toEqual([
      { key: "colour:#1f2d3a", source: "slide", swatch: "#1f2d3a", slideIndexes: [1] },
      { key: "colour:#4472c4", source: "slide", swatch: "#4472c4", slideIndexes: [2, 3] },
      { key: "colour:#d9d9d9", source: "slide", swatch: "#d9d9d9", slideIndexes: [4] },
      { key: "colour:fill", source: "slide", swatch: "fill", slideIndexes: [5] },
      { key: "colour:#ffffff", source: "layout", swatch: "#ffffff", slideIndexes: [6] },
    ]);
    expect(groups.every((g) => g.imageBlob === null)).toBe(true);
  });

  it("shows fill-only covering backgrounds as swatches, grouped by colour", async () => {
    const groups = await analyse(
      await testDeck([
        { shapes: [filledShape(2, solidFill("1F2D3A")), lyrics] },
        { shapes: [filledShape(2, solidFill("1f2d3a")), lyrics] },
        // PowerPoint's default rectangle: the theme's first fill style in Accent 1.
        { shapes: [filledShape(2, null), lyrics] },
        { shapes: [filledShape(2, gradientFill(["<a:srgbClr val=\"FFFFFF\"/>", "<a:srgbClr val=\"000000\"/>"])), lyrics] },
      ]),
    );
    expect(groups.map(({ key, source, swatch, slideIndexes }) => ({ key, source, swatch, slideIndexes }))).toEqual([
      { key: "covering:#1f2d3a", source: "covering", swatch: "#1f2d3a", slideIndexes: [1, 2] },
      { key: "covering:#4472c4", source: "covering", swatch: "#4472c4", slideIndexes: [3] },
      { key: "covering:fill", source: "covering", swatch: "fill", slideIndexes: [4] },
    ]);
  });
});

describe("extractCurrentBackgrounds passes over hidden elements", () => {
  it("does not show a hidden full-slide rectangle as the visible background", async () => {
    const hiddenRect = filledShape(2, solidFill("1F2D3A")).replace('name="Rectangle 2"', 'name="Rectangle 2" hidden="1"');
    const [only] = await analyse(
      await testDeck([{ shapes: [hiddenRect, textBox(9, "가사")], background: solidBackground("FFFFFF") }]),
    );
    expect([only.key, only.source]).toEqual(["colour:#ffffff", "slide"]);
  });
});

describe("extractCurrentBackgrounds shows a run of fills and pictures by its picture", () => {
  it("thumbnails the first picture when a fill lies under it, with no swatch", async () => {
    const deck = await testDeck([
      {
        shapes: [filledShape(2, solidFill("1F2D3A")), picture(3, "rId10"), textBox(9, "가사")],
        pictures: { rId10: "photo.png" },
      },
    ]);
    const [only] = await analyse(deck);
    expect(only.key).toBe("covering:#1f2d3a|ppt/media/photo.png");
    expect(only.swatch).toBeUndefined();
    const zip = await JSZip.loadAsync(deck);
    expect(new Uint8Array(await only.imageBlob!.arrayBuffer())).toEqual(
      await zip.file("ppt/media/photo.png")!.async("uint8array"),
    );
  });
});

describe("extractCurrentBackgrounds finds inherited backgrounds", () => {
  /**
   * The deck with every relationship written `Id, Target, Type`, as some
   * producers do (pptxgenjs writes `Id, Type, Target`), and its master's own
   * background set to `masterBackground` when given.
   */
  async function rewritten(deck: Uint8Array, masterBackground?: { bg: string; media: string }) {
    const zip = await JSZip.loadAsync(deck);
    for (const relsPart of zip.file(/_rels\/.*\.rels$/)) {
      const xml = await relsPart.async("text");
      zip.file(
        relsPart.name,
        xml.replace(
          /<Relationship Id="([^"]*)" Type="([^"]*)" Target="([^"]*)"\/>/g,
          '<Relationship Id="$1" Target="$3" Type="$2"/>',
        ),
      );
    }
    if (masterBackground) {
      const master = "ppt/slideMasters/slideMaster1.xml";
      const relsPart = "ppt/slideMasters/_rels/slideMaster1.xml.rels";
      const xml = await zip.file(master)!.async("text");
      zip.file(master, xml.replace("<p:cSld>", `<p:cSld>${masterBackground.bg}`));
      const rels = await zip.file(relsPart)!.async("text");
      zip.file(
        relsPart,
        rels.replace(
          "</Relationships>",
          `<Relationship Id="rId90" Target="../media/${masterBackground.media}" ` +
            `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"/></Relationships>`,
        ),
      );
      zip.file(`ppt/media/${masterBackground.media}`, await zip.file("ppt/media/layout.png")!.async("uint8array"));
    }
    return zip.generateAsync({ type: "uint8array" });
  }

  it("reports the layout's and the master's picture backgrounds whatever the attribute order", async () => {
    const slides = [{ shapes: [textBox(9, "가사")] }];
    const layout = { background: pictureBackground("rId20"), pictures: { rId20: "layout.png" } };

    const fromLayout = await analyse(await rewritten(await testDeck(slides, layout)));
    expect(fromLayout.map((g) => [g.key, g.source])).toEqual([["ppt/media/layout.png", "layout"]]);

    const noLayoutBackground = { background: "", pictures: { rId20: "layout.png" } };
    const fromMaster = await analyse(
      await rewritten(await testDeck(slides, noLayoutBackground), {
        bg: pictureBackground("rId90"),
        media: "master.png",
      }),
    );
    expect(fromMaster.map((g) => [g.key, g.source])).toEqual([["ppt/media/master.png", "master"]]);
  });
});
