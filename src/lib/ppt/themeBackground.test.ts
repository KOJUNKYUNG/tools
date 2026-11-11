import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractCurrentBackgrounds } from "./extractCurrentBackgrounds";
import { groupBackgrounds } from "./groupBackgrounds";
import { filledShape, solidFill, testDeck, textBox, type TestDeckOptions, type TestSlide } from "./testDeck";
import { noBackgroundColours } from "./themeBackground";

const lyrics = textBox(9, "주 하나님 지으신 모든 세계");

/** A deck with its theme, master and second slide rewritten. */
async function deck(
  edit: {
    theme?: (xml: string) => string;
    master?: (xml: string) => string;
    slide2?: (xml: string) => string;
  },
  options: TestDeckOptions = {},
  slides: TestSlide[] = [{ shapes: [lyrics] }, { shapes: [lyrics] }],
): Promise<File> {
  const zip = await JSZip.loadAsync(await testDeck(slides, undefined, options));
  for (const [part, change] of [
    ["ppt/theme/theme1.xml", edit.theme],
    ["ppt/slideMasters/slideMaster1.xml", edit.master],
    ["ppt/slides/slide2.xml", edit.slide2],
  ] as const) {
    if (change) zip.file(part, change(await zip.file(part)!.async("text")));
  }
  return new File([new Uint8Array(await zip.generateAsync({ type: "uint8array" }))], "deck.pptx");
}

/** Each slide's "no background" colour, in presentation order. */
async function noBackgrounds(file: File) {
  return (await extractCurrentBackgrounds(file)).map((b) => b.noBackground);
}

const themeColour = (slot: "lt1" | "dk1", rgb: string) => (xml: string) =>
  xml.replace(new RegExp(`<a:${slot}>[\\s\\S]*?</a:${slot}>`), `<a:${slot}><a:srgbClr val="${rgb}"/></a:${slot}>`);

describe("each slide's 'no background' colour", () => {
  it("is the theme's light colour, which the default colour map shows as the background", async () => {
    expect(await noBackgrounds(await deck({ theme: themeColour("lt1", "F5F0E6") }))).toEqual(["#f5f0e6", "#f5f0e6"]);
  });

  it("follows a master whose colour map shows the dark colour as the background", async () => {
    const file = await deck({
      theme: themeColour("dk1", "1F2A44"),
      master: (xml) => xml.replace(/bg1="lt1"/, 'bg1="dk1"'),
    });
    expect(await noBackgrounds(file)).toEqual(["#1f2a44", "#1f2a44"]);
  });

  it("follows a slide's own colour map, in presentation order", async () => {
    // slide2.xml shows the dark colour as its background; PowerPoint shows it first.
    const darkSlide2 = {
      theme: themeColour("dk1", "1F2A44"),
      slide2: (xml: string) =>
        xml.replace(
          "<a:masterClrMapping/>",
          '<a:overrideClrMapping bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" ' +
            'accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>',
        ),
    };
    expect(await noBackgrounds(await deck(darkSlide2, { slideList: [2, 1] }))).toEqual(["#1f2a44", "#ffffff"]);
  });

  it("is each slide's own master's on a deck of two masters, covered slides too", async () => {
    const file = await deck({}, { secondMaster: { lightColour: "1F2A44", slides: [2, 3] } }, [
      { shapes: [lyrics] },
      { shapes: [lyrics] },
      // Under a covering background too: the slide shows it once the covering background goes.
      { shapes: [filledShape(2, solidFill("6B1E2E")), lyrics] },
    ]);
    expect(await noBackgrounds(file)).toEqual(["#ffffff", "#1f2a44", "#1f2a44"]);
  });
});

describe("the 'no background' preview", () => {
  const twoMasters = () =>
    deck({}, { secondMaster: { lightColour: "1F2A44", slides: [2, 4] } }, [
      { shapes: [lyrics] },
      { shapes: [filledShape(2, solidFill("6B1E2E")), lyrics] },
      { shapes: [filledShape(2, solidFill("6B1E2E")), lyrics] },
      { shapes: [lyrics] },
    ]);

  it("takes the colour of the current-background group shown", async () => {
    const groups = groupBackgrounds(await extractCurrentBackgrounds(await twoMasters()));
    expect(groups.map(({ slideIndexes, noBackground }) => ({ slideIndexes, noBackground }))).toEqual([
      // The first master's layout shows white; the second master's, its own light colour.
      { slideIndexes: [1], noBackground: "#ffffff" },
      // A group across masters takes its first slide's.
      { slideIndexes: [2, 3], noBackground: "#1f2a44" },
      { slideIndexes: [4], noBackground: "#1f2a44" },
    ]);
  });

  it("tiles the gallery with the first two distinct colours in slide order", async () => {
    expect(noBackgroundColours(await extractCurrentBackgrounds(await twoMasters()))).toEqual(["#ffffff", "#1f2a44"]);
  });

  it("tiles a one-master deck with its one colour, as before", async () => {
    expect(noBackgroundColours(await extractCurrentBackgrounds(await deck({})))).toEqual(["#ffffff"]);
  });
});
