import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { changeBackground, type FillBackground } from "./changeBackground";
import { checkPptBackground, type PptBackgroundRequest } from "./changeBackgroundCheck";
import { solidBackground, testDeck, textBox, type TestDeckOptions } from "./testDeck";

/**
 * Three slides whose files are out of presentation order: PowerPoint shows
 * slide2.xml, slide3.xml, then slide1.xml.
 */
const OUT_OF_ORDER = [2, 3, 1];
/** The slide PowerPoint shows third in that deck. */
const THIRD_SHOWN = "ppt/slides/slide1.xml";

const deck = (slideList?: TestDeckOptions["slideList"]) =>
  testDeck(
    [1, 2, 3].map((n) => ({ shapes: [textBox(9, `${n}절`)] })),
    undefined,
    { slideList },
  );

const NAVY = "1F2A44";
const navy: FillBackground = { kind: "colour", rgb: NAVY };
const thirdSlide: PptBackgroundRequest = { background: navy, mode: "specific-slides", targetSlides: [3] };

/** The input with one slide painted navy, everything else byte-for-byte. */
async function paint(input: Uint8Array, part: string): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(input);
  const xml = await zip.file(part)!.async("text");
  zip.file(part, xml.replace(/<p:cSld[^>]*>/, (open) => `${open}${solidBackground(NAVY)}`));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

const violations = async (input: Uint8Array, output: Uint8Array) =>
  (await checkPptBackground(input, thirdSlide, output, "full")).map((v) => `${v.property} ${v.detail}`);

/** The slide parts whose XML the engine changed, choosing slide 3. */
async function changedSlides(input: Uint8Array): Promise<string[]> {
  const output = await changeBackground({
    pptxFile: new File([new Uint8Array(input)], "deck.pptx"),
    background: navy,
    mode: "specific-slides",
    targetSlides: thirdSlide.targetSlides,
  });
  const [before, after] = await Promise.all([JSZip.loadAsync(input), JSZip.loadAsync(output)]);
  const changed: string[] = [];
  for (const n of [1, 2, 3]) {
    const part = `ppt/slides/slide${n}.xml`;
    const [a, b] = await Promise.all([before.file(part)!.async("text"), after.file(part)!.async("text")]);
    if (a !== b) changed.push(part);
  }
  return changed;
}

describe("changeBackground chooses slides in presentation order", () => {
  it("changes the slide PowerPoint shows third, and no other", async () => {
    expect(await changedSlides(await deck(OUT_OF_ORDER))).toEqual([THIRD_SHOWN]);
  });

  it("reads the slide list from a presentation part named in another case", async () => {
    // OPC part names compare case-insensitively; the output check reads it so too.
    const zip = await JSZip.loadAsync(await deck(OUT_OF_ORDER));
    for (const [from, to] of [
      ["ppt/presentation.xml", "ppt/Presentation.xml"],
      ["ppt/_rels/presentation.xml.rels", "ppt/_rels/Presentation.xml.rels"],
    ]) {
      zip.file(to, await zip.file(from)!.async("uint8array"));
      zip.remove(from);
    }
    const renamed = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    expect(await changedSlides(renamed)).toEqual([THIRD_SHOWN]);
  });

  it("chooses in file order when the slide list is missing or names no slide", async () => {
    for (const slideList of ["missing", "dangling"] as const) {
      expect(await changedSlides(await deck(slideList))).toEqual(["ppt/slides/slide3.xml"]);
    }
  });
});

describe("checkPptBackground reads slide N in presentation order", () => {
  it("passes the slide PowerPoint shows third changed, and fails the third file changed", async () => {
    const input = await deck(OUT_OF_ORDER);
    expect(await violations(input, await paint(input, THIRD_SHOWN))).toEqual([]);
    expect(await violations(input, await paint(input, "ppt/slides/slide3.xml"))).toEqual([
      `target-background ${THIRD_SHOWN}`,
      "non-target-unchanged ppt/slides/slide3.xml",
    ]);
  });

  it("reads file order when the slide list is missing or names no slide", async () => {
    for (const slideList of ["missing", "dangling"] as const) {
      const input = await deck(slideList);
      expect(await violations(input, await paint(input, "ppt/slides/slide3.xml"))).toEqual([]);
    }
  });
});
