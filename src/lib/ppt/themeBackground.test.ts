import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { testDeck, textBox } from "./testDeck";
import { themeBackground } from "./themeBackground";

const lyrics = textBox(9, "주 하나님 지으신 모든 세계");

/** A two-slide deck with its theme and master rewritten. */
async function deck(edit: { theme?: (xml: string) => string; master?: (xml: string) => string }): Promise<File> {
  const zip = await JSZip.loadAsync(await testDeck([{ shapes: [lyrics] }, { shapes: [lyrics] }]));
  for (const [part, change] of [
    ["ppt/theme/theme1.xml", edit.theme],
    ["ppt/slideMasters/slideMaster1.xml", edit.master],
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
});
