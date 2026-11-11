import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { headerOnlyImage, standInPrepare } from "@/lib/image/slideImageStandIn";
import { changeBackground, type BgMode } from "./changeBackground";
import { BAND, BLOB, clickAnimations, filledShape, picture, pictureShape, solidFill, testDeck, textBox } from "./testDeck";
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

interface Run {
  mode?: BgMode;
  targetSlides?: number[];
  keptCovering?: string[];
  pickedPieces?: string[];
}

async function run(deck: Uint8Array, { mode = "all-slides", ...rest }: Run = {}): Promise<JSZip> {
  const output = await changeBackground({
    pptxFile: new File([new Uint8Array(deck)], "deck.pptx"),
    background: { kind: "picture", file: new File([new Uint8Array(PHOTO)], "photo.jpg") },
    mode,
    ...rest,
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
  return spTree.children.filter((c) => c.name !== "p:nvGrpSpPr" && c.name !== "p:grpSpPr").map((c) => idOf(c)!);
}

const mediaParts = (zip: JSZip) =>
  Object.keys(zip.files)
    .filter((p) => p.startsWith("ppt/media/") && !zip.files[p].dir)
    .sort();

/** Every part's content, by name. */
async function contents(zip: JSZip): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of Object.keys(zip.files).sort()) {
    if (!zip.files[name].dir) out[name] = Buffer.from(await zip.files[name].async("uint8array")).toString("base64");
  }
  return out;
}

const RED_BAND = "piece:fill:#ff0000@0,0,9144000,1028700";
const BLOB_PICTURE = "piece:picture:ppt/media/blob.png";

/** Two worship slides built from pieces: a red band, a picture blob, the lyrics; the blob animated. */
const piecedDeck = () =>
  testDeck(
    [1, 2].map((n) => ({
      shapes: [filledShape(3, solidFill("FF0000"), BAND), pictureShape(4, "rId11", BLOB), textBox(9, `${n}절`)],
      pictures: { rId11: "blob.png" },
      timing: clickAnimations([4, 9]),
    })),
  );

describe("changeBackground deletes the background pieces the user picked", () => {
  it("deletes a picked piece from every changed slide, with its media and animation", async () => {
    const zip = await run(await piecedDeck(), { pickedPieces: [BLOB_PICTURE] });

    for (const n of [1, 2]) {
      expect(await topLevelIds(zip, n)).toEqual(["3", "9"]);
      const xml = await slideXml(zip, n);
      expect(xml).not.toContain('spid="4"');
      expect(xml).toContain('spid="9"');
      expect(await zip.file(`ppt/slides/_rels/slide${n}.xml.rels`)!.async("text")).not.toContain("blob.png");
    }
    expect(mediaParts(zip)).toEqual(["ppt/media/background_custom.jpeg"]);
  });

  it("deletes picked pieces from the chosen slides only", async () => {
    const zip = await run(await piecedDeck(), {
      mode: "specific-slides",
      targetSlides: [2],
      pickedPieces: [RED_BAND, BLOB_PICTURE],
    });

    expect(await topLevelIds(zip, 1)).toEqual(["3", "4", "9"]);
    expect(await topLevelIds(zip, 2)).toEqual(["9"]);
    // Slide 1 still shows the blob.
    expect(mediaParts(zip)).toEqual(["ppt/media/background_custom.jpeg", "ppt/media/blob.png"]);
  });

  it("deletes picked pieces in master mode, and none from a slide whose covering group is kept", async () => {
    const deck = await testDeck([
      { shapes: [filledShape(3, solidFill("FF0000"), BAND), textBox(9, "1절")] },
      {
        shapes: [picture(2, "rId10"), filledShape(3, solidFill("FF0000"), BAND), textBox(9, "2절")],
        pictures: { rId10: "old.png" },
      },
    ]);
    const zip = await run(deck, { mode: "master", keptCovering: ["covering:ppt/media/old.png"], pickedPieces: [RED_BAND] });

    expect(await topLevelIds(zip, 1)).toEqual(["9"]);
    expect(await topLevelIds(zip, 2)).toEqual(["2", "3", "9"]);
  });

  it("changes nothing more than today when nothing is picked", async () => {
    const deck = await piecedDeck();
    const today = await contents(await run(deck));
    expect(await contents(await run(deck, { pickedPieces: [] }))).toEqual(today);
    // A key no slide has picks nothing.
    expect(await contents(await run(deck, { pickedPieces: ["piece:picture:ppt/media/other.png"] }))).toEqual(today);
  });
});
