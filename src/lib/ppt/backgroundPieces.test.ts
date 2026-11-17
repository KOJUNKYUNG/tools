import { describe, expect, it } from "vitest";
import { extractCurrentBackgrounds } from "./extractCurrentBackgrounds";
import { BAND, BLOB, filledShape, gradientFill, group, picture, pictureShape, solidFill, testDeck, textBox, type Box } from "./testDeck";

/** Each slide's background pieces, as the picker lists them. */
async function piecesOf(deck: Uint8Array) {
  const slides = await extractCurrentBackgrounds(new File([new Uint8Array(deck)], "deck.pptx"));
  return slides.map((s) => s.pieces.map(({ key, imagePath, swatch }) => ({ key, imagePath, swatch })));
}

/** An icon: a fifth of each side (4% of the slide). */
const ICON: Box = { x: 100000, y: 100000, w: 1828800, h: 1028700 };

const lyrics = textBox(9, "주 하나님 지으신 모든 세계");

describe("extractCurrentBackgrounds lists each slide's background pieces", () => {
  it("lists textless elements showing a picture or a fill, bottom first, with their keys", async () => {
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
        { key: RED_BAND, imagePath: null, swatch: "#ff0000" },
        { key: BLOB_PICTURE, imagePath: "ppt/media/blob.png", swatch: null },
      ],
      [
        { key: RED_BAND, imagePath: null, swatch: "#ff0000" },
        { key: BLOB_PICTURE, imagePath: "ppt/media/blob.png", swatch: null },
      ],
      [
        { key: "piece:fill:#00ff00@0,0,9144000,1028700", imagePath: null, swatch: "#00ff00" },
        { key: "piece:fill:#ff0000@6096000,3429000,3048000,1714500", imagePath: null, swatch: "#ff0000" },
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
        { key: "piece:fill:#ff0000@0,0,9144000,1028700", imagePath: null, swatch: "#ff0000" },
        {
          key: "piece:fill:#0000ff|#00ff00@6096000,3429000,3048000,1714500",
          imagePath: null,
          swatch: "#0000ff",
        },
      ],
    ]);
  });

  it("measures a piece at any rotation by the part of it on the slide", async () => {
    const turned = (shape: string, rot: number) => shape.replace("<a:xfrm>", `<a:xfrm rot="${rot}">`);
    // A square a third of the slide's height, at 45° in the middle: all of it on the slide (1/16).
    const SQUARE = { x: 3714750, y: 1714500, w: 1714500, h: 1714500 };
    // Twice that, centred on the left edge: half of it off the slide (1/8 on it).
    const EDGE = { x: -1714500, y: 857250, w: 3429000, h: 3429000 };
    // The square again, centred on the top edge: half of it (1/32) is under 5%, so not a piece.
    const CUT = { x: 3714750, y: -857250, w: 1714500, h: 1714500 };
    const deck = await testDeck([
      {
        shapes: [
          turned(filledShape(3, solidFill("FF0000"), SQUARE), 2700000),
          turned(filledShape(4, solidFill("00FF00"), EDGE), 2700000),
          turned(filledShape(5, solidFill("0000FF"), CUT), 2700000),
          lyrics,
        ],
      },
    ]);
    const [slide] = await extractCurrentBackgrounds(new File([new Uint8Array(deck)], "deck.pptx"));
    expect(slide.pieces.map(({ key, share, rotation, box }) => ({ key, share, rotation, box }))).toEqual([
      {
        key: "piece:fill:#ff0000@3714750,1714500,1714500,1714500,r2700000",
        share: expect.closeTo(1 / 16, 6),
        rotation: 45,
        box: { x: 3714750 / 9144000, y: 1714500 / 5143500, w: 1714500 / 9144000, h: 1714500 / 5143500 },
      },
      {
        key: "piece:fill:#00ff00@-1714500,857250,3429000,3429000,r2700000",
        share: expect.closeTo(1 / 8, 6),
        rotation: 45,
        box: { x: -1714500 / 9144000, y: 857250 / 5143500, w: 3429000 / 9144000, h: 3429000 / 5143500 },
      },
    ]);
  });

  it("shows a gradient's and a pattern's own colours, and neutral hatching for a colour it cannot read", async () => {
    const radial =
      `<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="40000"><a:srgbClr val="00FF00"/></a:gs>` +
      `</a:gsLst><a:path path="circle"/></a:gradFill>`;
    const pattern = `<a:pattFill prst="ltUpDiag"><a:fgClr><a:srgbClr val="FF0000"/></a:fgClr><a:bgClr><a:srgbClr val="FFFFFF"/></a:bgClr></a:pattFill>`;
    const unreadable = `<a:gradFill><a:gsLst><a:gs pos="0"><a:prstClr val="aliceBlue"/></a:gs></a:gsLst></a:gradFill>`;
    const deck = await testDeck([
      {
        shapes: [
          filledShape(3, gradientFill(['<a:srgbClr val="FFFFFF"/>', '<a:srgbClr val="000000"/>']).replace('ang="5400000"', 'ang="0"'), BAND),
          filledShape(4, radial, BLOB),
          filledShape(5, pattern, { ...BAND, y: 4114800 }),
          filledShape(6, unreadable, { ...BLOB, x: 0 }),
          lyrics,
        ],
      },
    ]);
    expect((await piecesOf(deck))[0].map((p) => p.swatch)).toEqual([
      "linear-gradient(90deg, #ffffff 0%, #000000 100%)",
      "radial-gradient(#ff0000 0%, #00ff00 40%)",
      "repeating-linear-gradient(135deg, #ff0000 0 2px, #ffffff 2px 4px)",
      "fill",
    ]);
  });

  describe("lists each slide's background graphics, which go by default", () => {
    const logo = picture(21, "rId11", ICON);
    const churchName = textBox(22, "○○교회", { x: 0, y: 4600000, w: 3000000, h: 400000 });
    const emptyFrame = filledShape(23, "<a:noFill/>", BAND);

    it("lists every master and layout element showing something, small ones and text included", async () => {
      const deck = await testDeck(
        [
          { shapes: [pictureShape(4, "rId11", BLOB), lyrics], pictures: { rId11: "blob.png" } },
          // A slide hiding its background graphics shows none of them.
          { shapes: [lyrics], hidesBackgroundGraphics: true },
        ],
        { shapes: [filledShape(30, solidFill("FF0000"), BAND)] },
        { master: { shapes: [pictureShape(20, "rId10", BLOB), logo, churchName, emptyFrame], pictures: { rId10: "blob.png", rId11: "logo.png" } } },
      );
      const slides = await extractCurrentBackgrounds(new File([new Uint8Array(deck)], "deck.pptx"));
      expect(slides.map((s) => s.graphics.map(({ key, kind, imagePath, swatch }) => ({ key, kind, imagePath, swatch })))).toEqual([
        [
          { key: "graphic:ppt/slidemasters/slidemaster1.xml#20", kind: "picture", imagePath: "ppt/media/blob.png", swatch: null },
          { key: "graphic:ppt/slidemasters/slidemaster1.xml#21", kind: "picture", imagePath: "ppt/media/logo.png", swatch: null },
          { key: "graphic:ppt/slidemasters/slidemaster1.xml#22", kind: "text", imagePath: null, swatch: null },
          { key: "graphic:ppt/slidelayouts/slidelayout1.xml#30", kind: "fill", imagePath: null, swatch: "#ff0000" },
        ],
        [],
      ]);
      // The slide's own picture stays a piece, picked apart from the master's.
      expect(slides[0].pieces.map((p) => p.key)).toEqual(["piece:picture:ppt/media/blob.png"]);
    });

    it("leaves out a covering background on the master: its own row keeps it", async () => {
      const deck = await testDeck([{ shapes: [lyrics] }], undefined, {
        master: { shapes: [picture(20, "rId10"), logo], pictures: { rId10: "master.png", rId11: "logo.png" } },
      });
      const [slide] = await extractCurrentBackgrounds(new File([new Uint8Array(deck)], "deck.pptx"));
      expect(slide.source).toBe("covering");
      expect(slide.graphics.map((g) => g.key)).toEqual(["graphic:ppt/slidemasters/slidemaster1.xml#21"]);
    });

    it("tells apart two graphics of one part sharing a shape id, and keeps a unique id's key plain", async () => {
      // Some producers repeat shape ids within a part.
      const deck = await testDeck([{ shapes: [lyrics] }], undefined, {
        master: { shapes: [picture(21, "rId11", ICON), picture(21, "rId12", BLOB), churchName], pictures: { rId11: "logo.png", rId12: "seal.png" } },
      });
      const [slide] = await extractCurrentBackgrounds(new File([new Uint8Array(deck)], "deck.pptx"));
      const keys = slide.graphics.map((g) => g.key);
      expect(new Set(keys).size).toBe(3);
      expect(keys[2]).toBe("graphic:ppt/slidemasters/slidemaster1.xml#22");
    });

    it("marks the background graphics lying under a slide's covering background", async () => {
      const deck = await testDeck(
        [{ shapes: [picture(2, "rId10"), lyrics], pictures: { rId10: "old.png" } }],
        undefined,
        { master: { shapes: [filledShape(20, solidFill("FF0000"), BAND)] } },
      );
      const [slide] = await extractCurrentBackgrounds(new File([new Uint8Array(deck)], "deck.pptx"));
      expect(slide.source).toBe("covering");
      // The master's band lies under the slide's photo: it does not show today.
      expect(slide.graphics.map((g) => g.underCovering)).toEqual([true]);
    });
  });

  it("gives a slide's covering background its place and size, as the picker shows it beside the pieces", async () => {
    // 95% of the slide's height, from the top.
    const TALL = { x: 0, y: 0, w: 9144000, h: 4886325 };
    const deck = await testDeck([
      { shapes: [picture(2, "rId10"), lyrics], pictures: { rId10: "old.png" } },
      { shapes: [filledShape(2, solidFill("1F2D3A"), TALL), picture(3, "rId10"), lyrics], pictures: { rId10: "old.png" } },
      { shapes: [lyrics] },
    ]);
    const slides = await extractCurrentBackgrounds(new File([new Uint8Array(deck)], "deck.pptx"));
    expect(slides.map((s) => s.coveringPlace)).toEqual([
      { box: { x: 0, y: 0, w: 1, h: 1 }, share: 1 },
      // The picture is the one shown, over the colour.
      { box: { x: 0, y: 0, w: 1, h: 1 }, share: 1 },
      undefined,
    ]);
    const coloured = await extractCurrentBackgrounds(
      new File([new Uint8Array(await testDeck([{ shapes: [filledShape(2, solidFill("1F2D3A"), TALL), lyrics] }]))], "deck.pptx"),
    );
    expect(coloured[0].coveringPlace).toEqual({ box: { x: 0, y: 0, w: 1, h: 0.95 }, share: 0.95 });
  });
});
