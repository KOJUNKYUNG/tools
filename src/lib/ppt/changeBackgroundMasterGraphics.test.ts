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

async function runOn(
  deck: Uint8Array,
  mode: BgMode,
  targetSlides?: number[],
  keptCovering?: readonly string[],
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

const text = (zip: JSZip, part: string) => zip.file(part)!.async("text");
const MASTER = "ppt/slideMasters/slideMaster1.xml";
const MASTER_RELS = "ppt/slideMasters/_rels/slideMaster1.xml.rels";
const LAYOUT = "ppt/slideLayouts/slideLayout1.xml";
const LAYOUT_RELS = "ppt/slideLayouts/_rels/slideLayout1.xml.rels";

/** Whether the part is byte-identical in the input and the output. */
async function unchanged(input: JSZip, output: JSZip, part: string): Promise<boolean> {
  const [a, b] = await Promise.all([input.file(part)!.async("uint8array"), output.file(part)!.async("uint8array")]);
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

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

  it("still deletes a slide's own photo under its lyrics when the master carries a logo", async () => {
    const deck = await testDeck(
      [{ shapes: [picture(2, "rId10"), textBox(9, "1절")], pictures: { rId10: "photo.png" } }],
      undefined,
      { master: { shapes: [logo], pictures: { rId11: "logo.png" } } },
    );
    const zip = await runOn(deck, "all-slides");
    expect(await text(zip, "ppt/slides/slide1.xml")).not.toContain('r:embed="rId10"');
    expect(mediaParts(zip)).toEqual(["ppt/media/background_custom.jpeg", "ppt/media/logo.png"]);
  });

  it("deletes a master picture lying over a small logo, and keeps the logo", async () => {
    const zip = await runOn(
      await testDeck(slides, undefined, { master: { ...pictureAndLogo, shapes: [logo, masterPicture] } }),
      "all-slides",
    );
    const master = await text(zip, MASTER);
    expect(master).not.toContain(masterPicture);
    expect(master).toContain(logo);
  });

  it("keeps a slide's lone picture, its content, when the master carries a logo", async () => {
    const lone = picture(2, "rId10");
    const zip = await runOn(
      await testDeck([{ shapes: [lone], pictures: { rId10: "score.png" } }], undefined, {
        master: { shapes: [logo], pictures: { rId11: "logo.png" } },
      }),
      "all-slides",
    );
    expect(await text(zip, "ppt/slides/slide1.xml")).toContain(lone);
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

describe("changeBackground deletes covering backgrounds on layouts, in master mode, and as the deck hides them", () => {
  const layoutPicture = picture(30, "rId10");
  /** The full-slide picture placed on the layout, not the master. */
  const pictureLayout = { shapes: [layoutPicture], pictures: { rId10: "layout.png" } };

  it("deletes a layout's full-slide picture in 전체", async () => {
    const zip = await runOn(await testDeck(slides, pictureLayout), "all-slides");
    expect(await text(zip, LAYOUT)).not.toContain(layoutPicture);
    expect(await text(zip, LAYOUT_RELS)).not.toContain("layout.png");
    expect(mediaParts(zip)).toEqual(["ppt/media/background_custom.jpeg"]);
  });

  it("deletes the master's and every layout's covering backgrounds in master mode, keeping the logo", async () => {
    const unusedPicture = picture(31, "rId10");
    const deck = await testDeck(slides, pictureLayout, {
      master: pictureAndLogo,
      unusedLayouts: [{ shapes: [unusedPicture], pictures: { rId10: "unused.png" } }],
    });
    const zip = await runOn(deck, "master");

    const master = await text(zip, MASTER);
    expect(master).not.toContain(masterPicture);
    expect(master).toContain(logo);
    expect(master).toMatch(/<p:bg><p:bgPr><a:blipFill/);
    expect(await text(zip, LAYOUT)).not.toContain(layoutPicture);
    expect(await text(zip, "ppt/slideLayouts/slideLayout2.xml")).not.toContain(unusedPicture);
    expect(mediaParts(zip)).toEqual(["ppt/media/background_custom.jpeg", "ppt/media/logo.png"]);
  });

  it("keeps the master picture in master mode when the user keeps its group", async () => {
    const deck = await testDeck(slides, undefined, { master: pictureAndLogo });
    const zip = await runOn(deck, "master", undefined, ["covering:ppt/media/master.png"]);
    expect(await text(zip, MASTER)).toContain(masterPicture);
    expect(await text(zip, MASTER_RELS)).toContain("master.png");
  });

  it("does not count a slide hiding background graphics as showing the master picture", async () => {
    const deck = await testDeck([lyrics("1절"), lyrics("2절"), { ...lyrics("3절"), hidesBackgroundGraphics: true }], undefined, {
      master: pictureAndLogo,
    });
    const [input, zip] = await Promise.all([JSZip.loadAsync(deck), runOn(deck, "specific-slides", [1, 2])]);
    expect(await text(zip, MASTER)).not.toContain(masterPicture);
    expect(await text(zip, MASTER)).toContain(logo);
    expect(await unchanged(input, zip, "ppt/slides/slide3.xml")).toBe(true);
  });

  it("leaves the master alone under a layout hiding background graphics", async () => {
    const deck = await testDeck(slides, { hidesBackgroundGraphics: true }, { master: pictureAndLogo });
    const [input, zip] = await Promise.all([JSZip.loadAsync(deck), runOn(deck, "all-slides")]);
    for (const part of [MASTER, MASTER_RELS, LAYOUT]) expect(await unchanged(input, zip, part)).toBe(true);
  });

  it("leaves a kept master picture, the layout and the slides' flags untouched", async () => {
    const deck = await testDeck(slides, undefined, { master: pictureAndLogo });
    const [input, zip] = await Promise.all([
      JSZip.loadAsync(deck),
      runOn(deck, "all-slides", undefined, ["covering:ppt/media/master.png"]),
    ]);
    for (const part of [MASTER, MASTER_RELS, LAYOUT, LAYOUT_RELS]) expect(await unchanged(input, zip, part)).toBe(true);
    expect(mediaParts(zip)).toContain("ppt/media/master.png");
    for (const n of [1, 2, 3]) expect(await text(zip, `ppt/slides/slide${n}.xml`)).not.toContain("showMasterSp");
  });
});

describe("changeBackground keeps a kept group's picture on a layout no slide uses", () => {
  it("leaves the unused layout's copy of a kept picture in master mode", async () => {
    const keptPicture = picture(31, "rId10");
    const deck = await testDeck([{ shapes: [picture(2, "rId10"), textBox(9, "1절")], pictures: { rId10: "kept.png" } }], undefined, {
      unusedLayouts: [{ shapes: [keptPicture], pictures: { rId10: "kept.png" } }],
    });
    const zip = await runOn(deck, "master", undefined, ["covering:ppt/media/kept.png"]);
    expect(await text(zip, "ppt/slideLayouts/slideLayout2.xml")).toContain(keptPicture);
  });
});

describe("changeBackground hides background graphics on chosen slides only", () => {
  const SLIDE = (n: number) => `ppt/slides/slide${n}.xml`;
  const hides = async (zip: JSZip, n: number) => /<p:sld\b[^>]*\bshowMasterSp="0"/.test(await text(zip, SLIDE(n)));

  it("hides them on exactly the chosen slides showing the master picture, and leaves the master and the others", async () => {
    const deck = await testDeck(slides, undefined, { master: pictureAndLogo });
    const [input, zip] = await Promise.all([JSZip.loadAsync(deck), runOn(deck, "specific-slides", [1, 3])]);

    expect([await hides(zip, 1), await hides(zip, 2), await hides(zip, 3)]).toEqual([true, false, true]);
    for (const part of [MASTER, MASTER_RELS, LAYOUT, SLIDE(2)]) expect(await unchanged(input, zip, part)).toBe(true);
    expect(await text(zip, SLIDE(1))).toMatch(/<p:bg><p:bgPr><a:blipFill/);
  });

  it("hides them on chosen slides showing a layout's picture", async () => {
    const deck = await testDeck(slides, { shapes: [picture(30, "rId10")], pictures: { rId10: "layout.png" } });
    const [input, zip] = await Promise.all([JSZip.loadAsync(deck), runOn(deck, "specific-slides", [2])]);
    expect([await hides(zip, 1), await hides(zip, 2), await hides(zip, 3)]).toEqual([false, true, false]);
    expect(await unchanged(input, zip, LAYOUT)).toBe(true);
  });

  it("never hides them on a slide of a kept group", async () => {
    const deck = await testDeck(slides, undefined, { master: pictureAndLogo });
    const zip = await runOn(deck, "specific-slides", [1, 2], ["covering:ppt/media/master.png"]);
    for (const n of [1, 2, 3]) expect(await hides(zip, n)).toBe(false);
  });

  it("never hides them on a slide that does not show a covering background there", async () => {
    const deck = await testDeck(slides, undefined, { master: { shapes: [logo], pictures: { rId11: "logo.png" } } });
    const zip = await runOn(deck, "specific-slides", [1]);
    for (const n of [1, 2, 3]) expect(await hides(zip, n)).toBe(false);
  });

  it("still deletes a chosen slide's own photo when it hides the master picture", async () => {
    const deck = await testDeck(
      [{ shapes: [picture(2, "rId10"), textBox(9, "1절")], pictures: { rId10: "photo.png" } }, lyrics("2절")],
      undefined,
      { master: pictureAndLogo },
    );
    const zip = await runOn(deck, "specific-slides", [1]);
    expect(await hides(zip, 1)).toBe(true);
    expect(await text(zip, SLIDE(1))).not.toContain('r:embed="rId10"');
    expect(mediaParts(zip)).not.toContain("ppt/media/photo.png");
  });
});
