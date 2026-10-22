import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractCurrentBackgrounds } from "./extractCurrentBackgrounds";
import { groupBackgrounds } from "./groupBackgrounds";
import { group, picture, pictureBackground, pictureShape, testDeck, textBox } from "./testDeck";

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
      { key: "none", source: "none", slideIndexes: [4, 5] },
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
