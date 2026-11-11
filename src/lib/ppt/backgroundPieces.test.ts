import { describe, expect, it } from "vitest";
import { extractCurrentBackgrounds } from "./extractCurrentBackgrounds";
import { BAND, BLOB, filledShape, group, picture, pictureShape, solidFill, testDeck, textBox, type Box } from "./testDeck";

/** Each slide's background pieces, as the picker lists them. */
async function piecesOf(deck: Uint8Array) {
  const slides = await extractCurrentBackgrounds(new File([new Uint8Array(deck)], "deck.pptx"));
  return slides.map((s) => s.pieces.map(({ key, imagePath, swatch, slideCount }) => ({ key, imagePath, swatch, slideCount })));
}

/** An icon: a fifth of each side (4% of the slide). */
const ICON: Box = { x: 100000, y: 100000, w: 1828800, h: 1028700 };

const lyrics = textBox(9, "주 하나님 지으신 모든 세계");

describe("extractCurrentBackgrounds lists each slide's background pieces", () => {
  it("lists textless elements showing a picture or a fill, bottom first, with their keys and slide counts", async () => {
    const deck = await testDeck([
      {
        shapes: [filledShape(3, solidFill("FF0000"), BAND), pictureShape(4, "rId11", BLOB), lyrics],
        pictures: { rId11: "blob.png" },
      },
      // The same band; the same picture under another id, elsewhere.
      { shapes: [filledShape(3, solidFill("FF0000"), BAND), picture(5, "rId12", BAND), lyrics], pictures: { rId12: "blob.png" } },
      // A band of another colour, and the red one at another place.
      { shapes: [filledShape(3, solidFill("00FF00"), BAND), filledShape(4, solidFill("FF0000"), BLOB), lyrics] },
    ]);
    const RED_BAND = "piece:fill:#ff0000@0,0,9144000,1028700";
    const BLOB_PICTURE = "piece:picture:ppt/media/blob.png";
    expect(await piecesOf(deck)).toEqual([
      [
        { key: RED_BAND, imagePath: null, swatch: "#ff0000", slideCount: 2 },
        { key: BLOB_PICTURE, imagePath: "ppt/media/blob.png", swatch: null, slideCount: 2 },
      ],
      [
        { key: RED_BAND, imagePath: null, swatch: "#ff0000", slideCount: 2 },
        { key: BLOB_PICTURE, imagePath: "ppt/media/blob.png", swatch: null, slideCount: 2 },
      ],
      [
        { key: "piece:fill:#00ff00@0,0,9144000,1028700", imagePath: null, swatch: "#00ff00", slideCount: 1 },
        { key: "piece:fill:#ff0000@6096000,3429000,3048000,1714500", imagePath: null, swatch: "#ff0000", slideCount: 1 },
      ],
    ]);
  });

  it("leaves out text, covering backgrounds, hidden elements, elements under 5% and unknown bounds", async () => {
    const hidden = filledShape(5, solidFill("0000FF"), BLOB).replace('name="Rectangle 5"', 'name="Rectangle 5" hidden="1"');
    const unknownBounds = filledShape(6, solidFill("0000FF"), BLOB).replace(/<a:xfrm>[\s\S]*?<\/a:xfrm>/, "");
    const deck = await testDeck([
      {
        shapes: [
          picture(2, "rId10"),
          filledShape(3, solidFill("FF0000"), ICON),
          filledShape(4, solidFill("FF0000"), BAND, "제목"),
          hidden,
          unknownBounds,
          filledShape(7, "<a:noFill/>", BAND),
          lyrics,
        ],
        pictures: { rId10: "old.png" },
      },
    ]);
    expect(await piecesOf(deck)).toEqual([[]]);
  });

  it("takes a transparent fill and a group as one piece each", async () => {
    const deck = await testDeck([
      {
        shapes: [
          filledShape(3, solidFill("FF0000", 50000), BAND),
          group(4, BLOB, [filledShape(5, solidFill("0000FF"), BLOB), filledShape(6, solidFill("00FF00"), BLOB)]),
          lyrics,
        ],
      },
    ]);
    expect(await piecesOf(deck)).toEqual([
      [
        { key: "piece:fill:#ff0000@0,0,9144000,1028700", imagePath: null, swatch: "#ff0000", slideCount: 1 },
        {
          key: "piece:fill:#0000ff|#00ff00@6096000,3429000,3048000,1714500",
          imagePath: null,
          swatch: "#0000ff",
          slideCount: 1,
        },
      ],
    ]);
  });
});
