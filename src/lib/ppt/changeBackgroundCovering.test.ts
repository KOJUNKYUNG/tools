import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { headerOnlyImage, standInPrepare } from "@/lib/image/slideImageStandIn";
import { changeBackground, type BgMode } from "./changeBackground";
import { extractCurrentBackgrounds } from "./extractCurrentBackgrounds";
import { groupBackgrounds } from "./groupBackgrounds";
import {
  FULL,
  SLIDE,
  clickAnimations,
  filledShape,
  gradientFill,
  group,
  picture,
  pictureShape,
  solidFill,
  testDeck,
  textBox,
  type TestSlide,
} from "./testDeck";
import { parseXml, type XmlElement } from "./xmlTree";

/** A phone photo's header: 4032 × 3024, upright. */
const PHOTO = headerOnlyImage("jpeg", { width: 4032, height: 3024 }, new Uint8Array([1]));

beforeAll(() => {
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 4032;
      naturalHeight = 3024;
      onload: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
});

async function run(slides: TestSlide[], mode: BgMode = "all-slides", targetSlides?: number[]): Promise<JSZip> {
  return runOn(await testDeck(slides), mode, targetSlides);
}

async function runOn(
  deck: Uint8Array,
  mode: BgMode = "all-slides",
  targetSlides?: number[],
  keptCovering?: string[],
): Promise<JSZip> {
  const output = await changeBackground({
    pptxFile: new File([new Uint8Array(deck)], "deck.pptx"),
    background: { kind: "picture", file: new File([new Uint8Array(PHOTO)], "photo.jpg") },
    mode,
    targetSlides,
    keptCovering,
    prepare: standInPrepare,
  });
  return JSZip.loadAsync(output);
}

const slideXml = (zip: JSZip, n: number) => zip.file(`ppt/slides/slide${n}.xml`)!.async("text");

/** The shape ids of slide `n`'s top-level elements, bottom first. */
async function topLevelIds(zip: JSZip, n: number): Promise<string[]> {
  const root = parseXml(await slideXml(zip, n))!;
  const spTree = root.children.find((c) => c.name === "p:cSld")!.children.find((c) => c.name === "p:spTree")!;
  const idOf = (el: XmlElement): string | undefined =>
    el.name === "p:cNvPr" ? el.attrs.id : el.children.map(idOf).find((id) => id !== undefined);
  return spTree.children
    .filter((c) => c.name !== "p:nvGrpSpPr" && c.name !== "p:grpSpPr")
    .map((c) => idOf(c)!);
}

const mediaParts = (zip: JSZip) =>
  Object.keys(zip.files)
    .filter((p) => p.startsWith("ppt/media/") && !zip.files[p].dir)
    .sort();

/** A worship slide: an old background picture, lyrics above it. */
const lyricsOver = (background: string, pictures: Record<string, string>): TestSlide => ({
  shapes: [background, textBox(9, "주 하나님 지으신 모든 세계")],
  pictures,
});

describe("changeBackground deletes covering backgrounds on the target slides", () => {
  it("deletes a covering background picture, its relationship and its media, and sets the new background", async () => {
    const zip = await run([lyricsOver(picture(2, "rId10"), { rId10: "old.png" })]);

    expect(await topLevelIds(zip, 1)).toEqual(["9"]);
    expect(mediaParts(zip)).toEqual(["ppt/media/background_custom.jpeg"]);
    const rels = await zip.file("ppt/slides/_rels/slide1.xml.rels")!.async("text");
    expect(rels).not.toContain("old.png");
    expect(await slideXml(zip, 1)).toMatch(/<p:bg><p:bgPr><a:blipFill/);
  });

  it("drops every relationship only the deleted element named, and the parts they alone used", async () => {
    // A photo with an artistic effect (its HD photo layer) and a hyperlink.
    const photo = picture(2, "rId10")
      .replace(`name="Picture 2"/>`, `name="Picture 2"><a:hlinkClick r:id="rId13"/></p:cNvPr>`)
      .replace(
        `<a:blip r:embed="rId10"/>`,
        `<a:blip r:embed="rId10"><a:extLst><a:ext uri="{BEBA8EAE-BF5A-486C-A8C5-ECC9F3942E4B}">` +
          `<a14:imgProps xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main"><a14:imgLayer r:embed="rId12"/>` +
          `</a14:imgProps></a:ext></a:extLst></a:blip>`,
      );
    const deck = await JSZip.loadAsync(await testDeck([lyricsOver(photo, { rId10: "old.png" })]));
    const relsPath = "ppt/slides/_rels/slide1.xml.rels";
    deck.file("ppt/media/old.wdp", new Uint8Array([1, 2, 3]));
    deck.file(
      relsPath,
      (await deck.file(relsPath)!.async("text")).replace(
        "</Relationships>",
        `<Relationship Id="rId12" Type="http://schemas.microsoft.com/office/2007/relationships/hdphoto" Target="../media/old.wdp"/>` +
          `<Relationship Id="rId13" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" ` +
          `Target="https://example.org/" TargetMode="External"/></Relationships>`,
      ),
    );
    const zip = await runOn(await deck.generateAsync({ type: "uint8array" }));

    expect(await topLevelIds(zip, 1)).toEqual(["9"]);
    const rels = await zip.file(relsPath)!.async("text");
    expect(rels).not.toMatch(/rId1[23]/);
    expect(mediaParts(zip)).toEqual(["ppt/media/background_custom.jpeg"]);
  });

  it("deletes a covering picture-filled shape and a covering group", async () => {
    const blobs = group(2, { x: -600000, y: -300000, w: 11000000, h: 6500000 }, [
      pictureShape(3, "rId10", { x: 0, y: 0, w: 5000000, h: 5000000 }),
      pictureShape(4, "rId11", { x: 6000000, y: 1500000, w: 5000000, h: 5000000 }),
    ]);
    const zip = await run([
      lyricsOver(pictureShape(2, "rId10"), { rId10: "photo.png" }),
      lyricsOver(blobs, { rId10: "blob1.png", rId11: "blob2.png" }),
    ]);

    expect(await topLevelIds(zip, 1)).toEqual(["9"]);
    expect(await topLevelIds(zip, 2)).toEqual(["9"]);
    expect(mediaParts(zip)).toEqual(["ppt/media/background_custom.jpeg"]);
  });

  it("deletes a run of two covering backgrounds from the bottom", async () => {
    const zip = await run([
      {
        shapes: [picture(2, "rId10"), pictureShape(3, "rId11"), textBox(9, "가사")],
        pictures: { rId10: "photo.png", rId11: "tint.png" },
      },
    ]);
    expect(await topLevelIds(zip, 1)).toEqual(["9"]);
  });

  it("counts only the part of the bounds inside the slide", async () => {
    // 90% of the height on the slide, the rest hanging off the top.
    const hanging = { x: 0, y: -SLIDE.h * 0.5, w: SLIDE.w, h: SLIDE.h * 1.4 };
    // Twice the slide, but only a quarter of it on the slide.
    const offCorner = { x: SLIDE.w / 2, y: SLIDE.h / 2, w: SLIDE.w * 2, h: SLIDE.h * 2 };
    const zip = await run([
      lyricsOver(picture(2, "rId10", hanging), { rId10: "a.png" }),
      lyricsOver(picture(2, "rId10", offCorner), { rId10: "b.png" }),
    ]);
    expect(await topLevelIds(zip, 1)).toEqual(["9"]);
    expect(await topLevelIds(zip, 2)).toEqual(["2", "9"]);
  });

  it("deletes from 90% of the slide's area, not at 89%", async () => {
    const zip = await run([
      lyricsOver(picture(2, "rId10", { ...FULL, h: SLIDE.h * 0.9 }), { rId10: "a.png" }),
      lyricsOver(picture(2, "rId10", { ...FULL, h: SLIDE.h * 0.89 }), { rId10: "b.png" }),
    ]);
    expect(await topLevelIds(zip, 1)).toEqual(["9"]);
    expect(await topLevelIds(zip, 2)).toEqual(["2", "9"]);
  });

  it("keeps a lone large picture with nothing above it (an image-to-pptx sheet-music slide)", async () => {
    const zip = await run([{ shapes: [picture(2, "rId10")], pictures: { rId10: "score.png" } }]);
    expect(await topLevelIds(zip, 1)).toEqual(["2"]);
    expect(mediaParts(zip)).toContain("ppt/media/score.png");
  });

  it("keeps a large picture higher in the stack", async () => {
    const zip = await run([
      { shapes: [textBox(9, "제목"), picture(2, "rId10"), textBox(10, "가사")], pictures: { rId10: "a.png" } },
    ]);
    expect(await topLevelIds(zip, 1)).toEqual(["9", "2", "10"]);
  });

  it("keeps a picture-filled shape that holds text, and stops the run there", async () => {
    const zip = await run([
      {
        shapes: [pictureShape(2, "rId10", FULL, "제목"), picture(3, "rId11"), textBox(9, "가사")],
        pictures: { rId10: "a.png", rId11: "b.png" },
      },
    ]);
    expect(await topLevelIds(zip, 1)).toEqual(["2", "3", "9"]);
  });

  it("keeps a picture part that is still used elsewhere", async () => {
    const zip = await run(
      [
        lyricsOver(picture(2, "rId10"), { rId10: "shared.png" }),
        // Slide 2 is not targeted and shows the same picture.
        lyricsOver(picture(2, "rId10"), { rId10: "shared.png" }),
        // The same slide shows the picture again, small, as content.
        {
          shapes: [picture(2, "rId10"), picture(3, "rId10", { x: 0, y: 0, w: 900000, h: 900000 })],
          pictures: { rId10: "shared2.png" },
        },
      ],
      "specific-slides",
      [1, 3],
    );
    expect(await topLevelIds(zip, 1)).toEqual(["9"]);
    expect(await topLevelIds(zip, 3)).toEqual(["3"]);
    expect(mediaParts(zip)).toEqual([
      "ppt/media/background_custom.jpeg",
      "ppt/media/shared.png",
      "ppt/media/shared2.png",
    ]);
    const rels3 = await zip.file("ppt/slides/_rels/slide3.xml.rels")!.async("text");
    expect(rels3).toContain("shared2.png");
  });

  it("removes the animations on a deleted element and keeps the others", async () => {
    const zip = await run([
      { ...lyricsOver(picture(2, "rId10"), { rId10: "a.png" }), timing: clickAnimations([2, 9]) },
      { ...lyricsOver(picture(2, "rId10"), { rId10: "b.png" }), timing: clickAnimations([2]) },
    ]);

    const first = await slideXml(zip, 1);
    expect([...first.matchAll(/spid="(\d+)"/g)].map((m) => m[1])).toEqual(["9", "9"]);
    expect(parseXml(first)).not.toBeNull();
    // Nothing animated is left, so no timing is left either.
    expect(await slideXml(zip, 2)).not.toContain("<p:timing");
  });

  it("in chosen-slides mode, leaves the other slides untouched", async () => {
    const deck = await testDeck([
      lyricsOver(picture(2, "rId10"), { rId10: "a.png" }),
      lyricsOver(picture(2, "rId10"), { rId10: "b.png" }),
    ]);
    const input = await JSZip.loadAsync(deck);
    const zip = await runOn(deck, "specific-slides", [1]);

    expect(await topLevelIds(zip, 1)).toEqual(["9"]);
    expect(await slideXml(zip, 2)).toBe(await slideXml(input, 2));
    expect(mediaParts(zip)).toContain("ppt/media/b.png");
  });

  it("keeps the covering backgrounds of a group the user switched off, with their parts and animations", async () => {
    const deck = await testDeck([
      { ...lyricsOver(picture(2, "rId10"), { rId10: "keep.png" }), timing: clickAnimations([2, 9]) },
      // The same group under another relationship id.
      lyricsOver(pictureShape(2, "rId30"), { rId30: "keep.png" }),
      lyricsOver(picture(2, "rId10"), { rId10: "old.png" }),
    ]);
    const input = await JSZip.loadAsync(deck);
    const zip = await runOn(deck, "all-slides", undefined, ["covering:ppt/media/keep.png"]);

    const between = (xml: string, from: string, to: string) => xml.slice(xml.indexOf(from), xml.indexOf(to) + to.length);
    for (const n of [1, 2]) {
      const [before, after] = [await slideXml(input, n), await slideXml(zip, n)];
      expect(between(after, "<p:spTree>", "</p:spTree>")).toBe(between(before, "<p:spTree>", "</p:spTree>"));
      // The new background goes under them.
      expect(after).toMatch(/<p:bg><p:bgPr><a:blipFill/);
    }
    const first = await slideXml(zip, 1);
    expect(between(first, "<p:timing>", "</p:timing>")).toBe(
      between(await slideXml(input, 1), "<p:timing>", "</p:timing>"),
    );
    expect(await zip.file("ppt/slides/_rels/slide1.xml.rels")!.async("text")).toContain('Id="rId10"');
    expect(await topLevelIds(zip, 3)).toEqual(["9"]);
    expect(mediaParts(zip)).toEqual(["ppt/media/background_custom.jpeg", "ppt/media/keep.png"]);
  });

  it("keeps the group whose preview key the user switched off, however its relationships are written", async () => {
    const blobs = group(2, { x: -600000, y: -300000, w: 11000000, h: 6500000 }, [
      pictureShape(3, "rId10", { x: 0, y: 0, w: 5000000, h: 5000000 }),
      pictureShape(4, "rId11", { x: 6000000, y: 1500000, w: 5000000, h: 5000000 }),
    ]);
    const deck = await testDeck([
      lyricsOver(blobs, { rId10: "Blob1.png", rId11: "blob2.png" }),
      lyricsOver(picture(2, "rId10"), { rId10: "old.png" }),
    ]);
    // A producer names the part in another case than the zip does, and
    // quotes the relationships' attributes with single quotes.
    const input = await JSZip.loadAsync(deck);
    const rels = "ppt/slides/_rels/slide1.xml.rels";
    const relsXml = (await input.file(rels)!.async("text")).replace("../media/Blob1.png", "../media/BLOB1.png");
    input.file(rels, relsXml.replace(/<Relationship\b[^>]*>/g, (rel) => rel.replaceAll('"', "'")));
    const renamed = await input.generateAsync({ type: "uint8array" });

    const groups = groupBackgrounds(await extractCurrentBackgrounds(new File([new Uint8Array(renamed)], "deck.pptx")));
    const kept = groups.find((g) => g.slideIndexes.includes(1))!;
    expect(kept.source).toBe("covering");
    const zip = await runOn(renamed, "all-slides", undefined, [kept.key]);

    expect(await topLevelIds(zip, 1)).toEqual(["2", "9"]);
    expect(await topLevelIds(zip, 2)).toEqual(["9"]);
  });

  it("finds nothing left to delete when re-run on its own output", async () => {
    const first = await run([lyricsOver(picture(2, "rId10"), { rId10: "a.png" })]);
    const second = await runOn(await first.generateAsync({ type: "uint8array" }));
    expect(await topLevelIds(second, 1)).toEqual(["9"]);
    // The earlier background is replaced: only the new picture is left.
    expect(mediaParts(second)).toEqual(["ppt/media/background_custom_1.jpeg"]);
  });
});

describe("changeBackground ignores hidden elements", () => {
  /** The element hidden, as PowerPoint's selection pane writes it. */
  const hidden = (el: string) => el.replace(/(<p:cNvPr id="\d+" name="[^"]*")/, '$1 hidden="1"');

  it("keeps a hidden covering background: it hides nothing", async () => {
    const zip = await run([lyricsOver(hidden(picture(2, "rId10")), { rId10: "a.png" })]);
    expect(await topLevelIds(zip, 1)).toEqual(["2", "9"]);
  });

  it("walks past a hidden element at the bottom to the covering background above it", async () => {
    const zip = await run([
      {
        shapes: [hidden(filledShape(2, solidFill("1F2D3A"))), picture(3, "rId10"), textBox(9, "가사")],
        pictures: { rId10: "a.png" },
      },
    ]);
    expect(await topLevelIds(zip, 1)).toEqual(["2", "9"]);
  });

  it("does not count a hidden element as something above", async () => {
    const zip = await run([
      { shapes: [picture(2, "rId10"), hidden(textBox(9, "메모"))], pictures: { rId10: "score.png" } },
    ]);
    expect(await topLevelIds(zip, 1)).toEqual(["2", "9"]);
  });

  it("passes over the text of a hidden member", async () => {
    const zip = await run([
      lyricsOver(group(2, FULL, [filledShape(3, solidFill("000000")), hidden(textBox(4, "메모"))]), {}),
    ]);
    expect(await topLevelIds(zip, 1)).toEqual(["9"]);
  });

  it("does not count a hidden ink stroke as something above", async () => {
    const ink =
      `<p:contentPart r:id="rId20"><p14:nvContentPartPr><p14:cNvPr id="9" name="Ink 9" hidden="1"/>` +
      `<p14:cNvContentPartPr/><p14:nvPr/></p14:nvContentPartPr><p14:xfrm><a:off x="0" y="0"/><a:ext cx="10" cy="10"/></p14:xfrm></p:contentPart>`;
    const zip = await run([{ shapes: [picture(2, "rId10"), ink], pictures: { rId10: "score.png" } }]);
    // The picture stays; the ink's own id sits under another prefix.
    expect(await topLevelIds(zip, 1)).toEqual(["2", undefined]);
  });

  it("keeps a group whose only opaque member is hidden", async () => {
    const zip = await run([
      lyricsOver(group(2, FULL, [hidden(filledShape(3, solidFill("000000"))), filledShape(4, "<a:noFill/>")]), {}),
    ]);
    expect(await topLevelIds(zip, 1)).toEqual(["2", "9"]);
  });
});

describe("changeBackground deletes opaquely filled covering backgrounds", () => {
  const white = `<a:srgbClr val="FFFFFF"/>`;
  const navy = `<a:schemeClr val="tx2"><a:lumMod val="75000"/></a:schemeClr>`;

  it("deletes an opaque solid rectangle", async () => {
    const zip = await run([lyricsOver(filledShape(2, solidFill("1F2D3A")), {})]);
    expect(await topLevelIds(zip, 1)).toEqual(["9"]);
  });

  it("deletes an opaque gradient and a rectangle filled by its style reference", async () => {
    const zip = await run([
      lyricsOver(filledShape(2, gradientFill([white, navy])), {}),
      lyricsOver(filledShape(2, null), {}),
    ]);
    expect(await topLevelIds(zip, 1)).toEqual(["9"]);
    expect(await topLevelIds(zip, 2)).toEqual(["9"]);
  });

  it("deletes a group of opaque rectangles, and one whose members take the group's fill", async () => {
    const half = { ...FULL, w: SLIDE.w / 2 };
    const zip = await run([
      lyricsOver(
        group(2, FULL, [filledShape(3, solidFill("000000")), filledShape(4, solidFill("FFFFFF", 30000), half)]),
        {},
      ),
      lyricsOver(
        group(2, FULL, [filledShape(3, "<a:grpFill/>")]).replace(
          "</a:xfrm></p:grpSpPr>",
          `</a:xfrm>${solidFill("336699")}</p:grpSpPr>`,
        ),
        {},
      ),
    ]);
    expect(await topLevelIds(zip, 1)).toEqual(["9"]);
    expect(await topLevelIds(zip, 2)).toEqual(["9"]);
  });

  it("keeps a translucent overlay, a shape with no fill, a filled box holding text and a gradient with a transparent stop", async () => {
    const zip = await run([
      lyricsOver(filledShape(2, solidFill("000000", 40000)), {}),
      lyricsOver(filledShape(2, "<a:noFill/>"), {}),
      lyricsOver(filledShape(2, solidFill("1F2D3A"), FULL, "제목"), {}),
      lyricsOver(filledShape(2, gradientFill([white, `<a:srgbClr val="000000"><a:alpha val="0"/></a:srgbClr>`])), {}),
    ]);
    for (const n of [1, 2, 3, 4]) expect(await topLevelIds(zip, n)).toEqual(["2", "9"]);
  });

  it("keeps a group whose members take the group's fill when the group has none", async () => {
    // The members' style reference would fill them; their explicit group fill wins.
    const member = filledShape(3, null).replace("</p:spPr>", "<a:grpFill/></p:spPr>");
    const zip = await run([lyricsOver(group(2, FULL, [member]), {})]);
    expect(await topLevelIds(zip, 1)).toEqual(["2", "9"]);
  });

  it("keeps a lone filled rectangle with nothing above it", async () => {
    const zip = await run([{ shapes: [filledShape(2, solidFill("1F2D3A"))] }]);
    expect(await topLevelIds(zip, 1)).toEqual(["2"]);
  });
});
