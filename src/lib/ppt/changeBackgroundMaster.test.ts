import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { headerOnlyImage, standInPrepare } from "@/lib/image/slideImageStandIn";
import { changeBackground, type BgMode } from "./changeBackground";
import {
  pictureBackground,
  picture,
  solidBackground,
  testDeck,
  textBox,
  type TestLayout,
  type TestSlide,
} from "./testDeck";

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

async function runOn(deck: Uint8Array, mode: BgMode): Promise<Uint8Array> {
  return changeBackground({
    pptxFile: new File([new Uint8Array(deck)], "deck.pptx"),
    bgImage: new File([new Uint8Array(PHOTO)], "photo.jpg"),
    mode,
    prepare: standInPrepare,
  });
}

async function master(slides: TestSlide[], layout?: TestLayout): Promise<JSZip> {
  return JSZip.loadAsync(await runOn(await testDeck(slides, layout), "master"));
}

const text = (zip: JSZip, part: string) => zip.file(part)!.async("text");
const SLIDE1 = "ppt/slides/slide1.xml";
const LAYOUT1 = "ppt/slideLayouts/slideLayout1.xml";
const MASTER1 = "ppt/slideMasters/slideMaster1.xml";

const mediaParts = (zip: JSZip) =>
  Object.keys(zip.files)
    .filter((p) => p.startsWith("ppt/media/") && !zip.files[p].dir)
    .sort();

const lyrics = textBox(9, "주 하나님 지으신 모든 세계");

describe("changeBackground in master mode clears what lies above the master", () => {
  it("removes slides' own solid and picture backgrounds, and the master carries the new one", async () => {
    const zip = await master([
      { shapes: [lyrics], background: solidBackground("1F3864") },
      { shapes: [lyrics], background: pictureBackground("rId10"), pictures: { rId10: "old.png" } },
    ]);

    expect(await text(zip, SLIDE1)).not.toContain("<p:bg>");
    expect(await text(zip, "ppt/slides/slide2.xml")).not.toContain("<p:bg>");
    expect(await text(zip, MASTER1)).toMatch(/<p:bg><p:bgPr><a:blipFill/);
    // The picture background's relationship and part go with it.
    expect(await text(zip, "ppt/slides/_rels/slide2.xml.rels")).not.toContain("old.png");
    expect(mediaParts(zip)).toEqual(["ppt/media/background_custom.jpeg"]);
  });

  it("removes a layout's own background and the part only it used", async () => {
    const zip = await master([{ shapes: [lyrics] }], {
      background: pictureBackground("rId20"),
      pictures: { rId20: "layout.png" },
    });

    expect(await text(zip, LAYOUT1)).not.toContain("<p:bg>");
    expect(await text(zip, "ppt/slideLayouts/_rels/slideLayout1.xml.rels")).not.toContain("layout.png");
    expect(mediaParts(zip)).toEqual(["ppt/media/background_custom.jpeg"]);
  });

  it("deletes covering backgrounds on every slide", async () => {
    const zip = await master([
      { shapes: [picture(2, "rId10"), lyrics], pictures: { rId10: "a.png" } },
      { shapes: [picture(2, "rId10"), lyrics], pictures: { rId10: "b.png" } },
    ]);

    for (const n of [1, 2]) {
      const xml = await text(zip, `ppt/slides/slide${n}.xml`);
      expect(xml).not.toContain("<p:pic>");
      expect(xml).toContain("주 하나님");
    }
    expect(mediaParts(zip)).toEqual(["ppt/media/background_custom.jpeg"]);
  });

  it("keeps a picture the slide still shows after its own background goes", async () => {
    const small = { x: 0, y: 0, w: 900000, h: 900000 };
    const zip = await master([
      {
        shapes: [picture(2, "rId10", small), lyrics],
        pictures: { rId10: "logo.png" },
        background: pictureBackground("rId10"),
      },
    ]);

    expect(await text(zip, SLIDE1)).not.toContain("<p:bg>");
    expect(await text(zip, "ppt/slides/_rels/slide1.xml.rels")).toContain("logo.png");
    expect(mediaParts(zip)).toContain("ppt/media/logo.png");
  });

  it("re-run on an \"all slides\" output or its own, leaves one background, on the master", async () => {
    const deck = await testDeck([{ shapes: [picture(2, "rId10"), lyrics], pictures: { rId10: "a.png" } }]);
    const zip = await JSZip.loadAsync(await runOn(await runOn(await runOn(deck, "all-slides"), "master"), "master"));

    expect(await text(zip, SLIDE1)).not.toContain("<p:bg>");
    expect(await text(zip, SLIDE1)).toContain("주 하나님");
    expect(await text(zip, MASTER1)).toContain("<p:bg>");
    // Each run deletes the background the run before set, so its name is free again.
    expect(mediaParts(zip)).toEqual(["ppt/media/background_custom.jpeg"]);
  });
});
