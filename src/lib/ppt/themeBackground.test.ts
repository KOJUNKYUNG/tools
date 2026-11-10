import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { testDeck, textBox, type TestDeckOptions } from "./testDeck";
import { themeBackground } from "./themeBackground";

const lyrics = textBox(9, "주 하나님 지으신 모든 세계");

/** A two-slide deck with its theme and master rewritten. */
async function deck(
  edit: {
    theme?: (xml: string) => string;
    master?: (xml: string) => string;
    slide2?: (xml: string) => string;
  },
  slideList?: TestDeckOptions["slideList"],
): Promise<File> {
  const zip = await JSZip.loadAsync(await testDeck([{ shapes: [lyrics] }, { shapes: [lyrics] }], undefined, { slideList }));
  for (const [part, change] of [
    ["ppt/theme/theme1.xml", edit.theme],
    ["ppt/slideMasters/slideMaster1.xml", edit.master],
    ["ppt/slides/slide2.xml", edit.slide2],
  ] as const) {
    if (change) zip.file(part, change(await zip.file(part)!.async("text")));
  }
  return new File([new Uint8Array(await zip.generateAsync({ type: "uint8array" }))], "deck.pptx");
}

const themeColour = (slot: "lt1" | "dk1", rgb: string) => (xml: string) =>
  xml.replace(new RegExp(`<a:${slot}>[\\s\\S]*?</a:${slot}>`), `<a:${slot}><a:srgbClr val="${rgb}"/></a:${slot}>`);

describe("themeBackground", () => {
  it("is the theme's light colour, which the default colour map shows as the background", async () => {
    expect(await themeBackground(await deck({ theme: themeColour("lt1", "F5F0E6") }))).toBe("#f5f0e6");
  });

  it("follows a master whose colour map shows the dark colour as the background", async () => {
    const file = await deck({
      theme: themeColour("dk1", "1F2A44"),
      master: (xml) => xml.replace(/bg1="lt1"/, 'bg1="dk1"'),
    });
    expect(await themeBackground(file)).toBe("#1f2a44");
  });

  it("is the colour of the slide PowerPoint shows first, not the first file", async () => {
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
    expect(await themeBackground(await deck(darkSlide2, [2, 1]))).toBe("#1f2a44");
    expect(await themeBackground(await deck(darkSlide2, "missing"))).not.toBe("#1f2a44");
  });
});
