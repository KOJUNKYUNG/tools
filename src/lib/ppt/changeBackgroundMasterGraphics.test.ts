import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { headerOnlyImage, standInPrepare } from "@/lib/image/slideImageStandIn";
import { changeBackground, type BgMode } from "./changeBackground";
import { clickAnimations, picture, testDeck, textBox, type TestMaster, type TestSlide } from "./testDeck";

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

async function runOn(deck: Uint8Array, mode: BgMode, targetSlides?: number[]): Promise<JSZip> {
  const output = await changeBackground({
    pptxFile: new File([new Uint8Array(deck)], "deck.pptx"),
    background: { kind: "picture", file: new File([new Uint8Array(PHOTO)], "photo.jpg") },
    mode,
    targetSlides,
    prepare: standInPrepare,
  });
  return JSZip.loadAsync(output);
}

const text = (zip: JSZip, part: string) => zip.file(part)!.async("text");
const MASTER = "ppt/slideMasters/slideMaster1.xml";
const MASTER_RELS = "ppt/slideMasters/_rels/slideMaster1.xml.rels";

const mediaParts = (zip: JSZip) =>
  Object.keys(zip.files)
    .filter((p) => p.startsWith("ppt/media/") && !zip.files[p].dir)
    .sort();

/** A small logo in the bottom-right corner. */
const LOGO_BOX = { x: 8001000, y: 4343400, w: 914400, h: 571500 };
const masterPicture = picture(20, "rId10");
const logo = picture(21, "rId11", LOGO_BOX);
/** The worship deck's master: a full-slide picture under a logo. */
const pictureAndLogo: TestMaster = {
  shapes: [masterPicture, logo],
  pictures: { rId10: "master.png", rId11: "logo.png" },
};
const lyrics = (verse: string): TestSlide => ({ shapes: [textBox(9, verse)] });
const slides = [lyrics("1절"), lyrics("2절"), lyrics("3절")];

describe("changeBackground deletes a covering background on the master", () => {
  it("deletes the master picture in 전체, keeps the logo, and every slide carries the new background", async () => {
    const zip = await runOn(await testDeck(slides, undefined, { master: pictureAndLogo }), "all-slides");

    const master = await text(zip, MASTER);
    expect(master).not.toContain(masterPicture);
    expect(master).toContain(logo);
    expect(await text(zip, MASTER_RELS)).not.toContain("master.png");
    expect(mediaParts(zip)).toEqual(["ppt/media/background_custom.jpeg", "ppt/media/logo.png"]);
    for (const n of [1, 2, 3]) {
      expect(await text(zip, `ppt/slides/slide${n}.xml`)).toMatch(/<p:bg><p:bgPr><a:blipFill/);
    }
  });

  it("does the same when the chosen slides are every slide showing it", async () => {
    const deck = await testDeck(slides, undefined, { master: pictureAndLogo });
    const [all, chosen] = await Promise.all([runOn(deck, "all-slides"), runOn(deck, "specific-slides", [1, 2, 3])]);
    expect(await text(chosen, MASTER)).toBe(await text(all, MASTER));
    expect(await text(chosen, MASTER_RELS)).toBe(await text(all, MASTER_RELS));
    expect(mediaParts(chosen)).toEqual(mediaParts(all));
  });

  it("deletes an animation naming the master picture with it", async () => {
    const zip = await runOn(
      await testDeck(slides, undefined, { master: { ...pictureAndLogo, timing: clickAnimations([20]) } }),
      "all-slides",
    );
    expect(await text(zip, MASTER)).not.toContain("<p:timing>");
  });

  it("leaves a master with only a logo byte-identical", async () => {
    const deck = await testDeck(slides, undefined, { master: { shapes: [logo], pictures: { rId11: "logo.png" } } });
    const [input, zip] = await Promise.all([JSZip.loadAsync(deck), runOn(deck, "all-slides")]);
    for (const part of [MASTER, MASTER_RELS]) {
      expect(await zip.file(part)!.async("uint8array")).toEqual(await input.file(part)!.async("uint8array"));
    }
  });

  it("never takes a placeholder or a hidden element on the master for a covering background", async () => {
    const placeholder = picture(22, "rId10").replace("<p:nvPr/>", '<p:nvPr><p:ph type="pic" idx="10"/></p:nvPr>');
    const hidden = picture(23, "rId12").replace('name="Picture 23"', 'name="Picture 23" hidden="1"');
    const deck = await testDeck(slides, undefined, {
      master: { shapes: [placeholder, hidden, logo], pictures: { rId10: "master.png", rId11: "logo.png", rId12: "hidden.png" } },
    });
    const [input, zip] = await Promise.all([JSZip.loadAsync(deck), runOn(deck, "all-slides")]);
    expect(await text(zip, MASTER)).toBe(await text(input, MASTER));
  });
});
