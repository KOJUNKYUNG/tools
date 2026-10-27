import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { changeBackground, type BgMode } from "./changeBackground";
import { checkPptBackground, type PptBackgroundRequest, type RequestedBackground } from "./changeBackgroundCheck";
import { pictureBackground, solidBackground, testDeck, textBox } from "./testDeck";

const lyrics = textBox(9, "주 하나님 지으신 모든 세계");

/** Two slides, the second with its own picture background; the layout carries a picture too. */
const deck = () =>
  testDeck(
    [
      { shapes: [lyrics] },
      { shapes: [lyrics], background: pictureBackground("rId10"), pictures: { rId10: "old.png" } },
    ],
    { background: pictureBackground("rId20"), pictures: { rId20: "layout.png" } },
  );

async function applied(background: RequestedBackground, mode: BgMode = "all-slides") {
  const input = await deck();
  // Fills carry no picture, so the request is what the engine is given.
  if (background.kind === "picture") throw new Error("fills only");
  const output = await changeBackground({ pptxFile: new File([new Uint8Array(input)], "deck.pptx"), background, mode });
  const request: PptBackgroundRequest = { background, mode };
  return { input, output, request };
}

/** Rewrite one output part, keeping everything else byte-for-byte. */
async function mutate(bytes: Uint8Array, part: string, edit: (xml: string) => string): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  zip.file(part, edit(await zip.file(part)!.async("text")));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

const properties = async (input: Uint8Array, request: PptBackgroundRequest, output: Uint8Array) =>
  (await checkPptBackground(input, request, output, "full")).map((v) => `${v.property} ${v.detail}`);

const BG = /<p:bg>[\s\S]*?<\/p:bg>/;

describe("checkPptBackground on a solid colour", () => {
  it("passes the engine's output at full depth", async () => {
    const { input, output, request } = await applied({ kind: "colour", rgb: "1F2A44" });
    expect(await properties(input, request, output)).toEqual([]);
  });

  it("flags a slide painted another colour", async () => {
    const { input, output, request } = await applied({ kind: "colour", rgb: "1F2A44" });
    const tampered = await mutate(output, "ppt/slides/slide2.xml", (xml) => xml.replace(BG, solidBackground("6B1E2E")));
    expect(await properties(input, request, tampered)).toEqual(["target-background ppt/slides/slide2.xml"]);
  });
});

describe("checkPptBackground on no background", () => {
  it("passes the engine's output at full depth, on slides and in master mode", async () => {
    for (const mode of ["all-slides", "master"] as const) {
      const { input, output, request } = await applied({ kind: "none" }, mode);
      expect(await properties(input, request, output)).toEqual([]);
    }
  });

  it("flags a slide whose own background was only removed, so it shows its layout's picture", async () => {
    const { input, output, request } = await applied({ kind: "none" });
    const tampered = await mutate(output, "ppt/slides/slide1.xml", (xml) => xml.replace(BG, ""));
    expect(await properties(input, request, tampered)).toEqual(["target-background ppt/slides/slide1.xml"]);
  });

  it("flags the theme colour shifted by a modifier", async () => {
    const { input, output, request } = await applied({ kind: "none" }, "master");
    const master = "ppt/slideMasters/slideMaster1.xml";
    const tampered = await mutate(output, master, (xml) =>
      xml.replace('<a:schemeClr val="bg1"/>', '<a:schemeClr val="bg1"><a:lumMod val="50000"/></a:schemeClr>'),
    );
    expect(await properties(input, request, tampered)).toEqual([`target-background ${master}`]);
  });
});
