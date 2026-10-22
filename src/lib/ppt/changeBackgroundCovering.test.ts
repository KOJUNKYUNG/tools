import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { headerOnlyImage, standInPrepare } from "@/lib/image/slideImageStandIn";
import { changeBackground, type BgMode } from "./changeBackground";
import {
  FULL,
  SLIDE,
  clickAnimations,
  group,
  picture,
  pictureShape,
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

async function runOn(deck: Uint8Array, mode: BgMode = "all-slides", targetSlides?: number[]): Promise<JSZip> {
  const output = await changeBackground({
    pptxFile: new File([new Uint8Array(deck)], "deck.pptx"),
    bgImage: new File([new Uint8Array(PHOTO)], "photo.jpg"),
    mode,
    targetSlides,
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

  it("finds nothing left to delete when re-run on its own output", async () => {
    const first = await run([lyricsOver(picture(2, "rId10"), { rId10: "a.png" })]);
    const second = await runOn(await first.generateAsync({ type: "uint8array" }));
    expect(await topLevelIds(second, 1)).toEqual(["9"]);
    // The earlier background is replaced: only the new picture is left.
    expect(mediaParts(second)).toEqual(["ppt/media/background_custom_1.jpeg"]);
  });
});
