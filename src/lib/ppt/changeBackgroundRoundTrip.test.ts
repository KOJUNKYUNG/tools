import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubHeaderCanvas } from "@/lib/image/headerCanvas";
import { slideImagePreparer, type PreparedImage, type PrepareStep } from "@/lib/image/slideImage";
import { headerOnlyImage } from "@/lib/image/slideImageStandIn";
import { changeBackground } from "./changeBackground";
import { testDeck, textBox } from "./testDeck";

// The background a run puts in the deck is offered as a file to reuse
// from the result card. Uploaded again, with no edits, on a deck of
// the same aspect, it must go in byte for byte: no quality lost on re-use.
// The real preparer runs here, its canvas stood in (`stubHeaderCanvas`).

/** Stub the browser's Image element, which the engine sizes an uncropped picture with. */
function stubImage(width: number, height: number): void {
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = width;
      naturalHeight = height;
      onload: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
}
afterEach(() => vi.unstubAllGlobals());

/** A 16:9 deck, or one of another shape (EMU). */
async function deck(size?: { w: number; h: number }): Promise<File> {
  let bytes = await testDeck([{ shapes: [textBox(9, "주 하나님 지으신 모든 세계")] }]);
  if (size) {
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("ppt/presentation.xml")!.async("text");
    zip.file("ppt/presentation.xml", xml.replace(/<p:sldSz\b[^>]*\/>/, `<p:sldSz cx="${size.w}" cy="${size.h}"/>`));
    bytes = await zip.generateAsync({ type: "uint8array" });
  }
  return new File([Uint8Array.from(bytes)], "deck.pptx");
}

async function backgroundMedia(deckBytes: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(deckBytes);
  const [name] = Object.keys(zip.files).filter((p) => p.startsWith("ppt/media/background_custom"));
  return zip.file(name)!.async("uint8array");
}

/** Runs the tool on `deckFile` with this picture, uncropped (centred), and the step when given. */
async function apply(deckFile: File, picture: Uint8Array, size: { width: number; height: number }, step?: PrepareStep) {
  stubImage(size.width, size.height);
  return changeBackground({
    pptxFile: deckFile,
    background: { kind: "picture", file: new File([Uint8Array.from(picture)], "picture") },
    mode: "all-slides",
    prepare: slideImagePreparer(step),
  });
}

/** A step baking effects in: a new picture of the fitted size. */
const filtered: PrepareStep = (fitted) => new OffscreenCanvas(fitted.width, fitted.height);

const reUploaded = async (picture: PreparedImage, deckFile: File) =>
  backgroundMedia((await apply(deckFile, picture.bytes, picture)).deck);

describe("changeBackground's background picture, re-used", () => {
  const photo = headerOnlyImage("jpeg", { width: 6000, height: 4000 }, new Uint8Array([1]));
  const SOURCE = { width: 6000, height: 4000 };

  it.each([
    ["a photo, saved as JPEG", "jpeg", undefined],
    ["a flat graphic, saved as PNG", "png", undefined],
    ["a filtered photo, saved as JPEG", "jpeg", filtered],
    ["a filtered graphic, saved as PNG", "png", filtered],
  ] as const)("returns %s, which goes back in byte for byte", async (_, wins, step) => {
    stubHeaderCanvas(wins);
    const deckFile = await deck();
    const first = await apply(deckFile, photo, SOURCE, step);

    expect(first.picture).toMatchObject({ format: wins, width: 3840, height: 2160 });
    expect(await backgroundMedia(first.deck)).toEqual(first.picture!.bytes);

    // Re-measured elsewhere, the format rule would pick the other format.
    stubHeaderCanvas(wins === "png" ? "jpeg" : "png");
    expect(await reUploaded(first.picture!, deckFile)).toEqual(first.picture!.bytes);
  });

  it("goes back in byte for byte on a slide wider than 16:9, where the 4K box binds its width", async () => {
    stubHeaderCanvas("jpeg");
    const wide = await deck({ w: 12192000, h: 5300870 }); // 2.3 : 1
    const first = await apply(wide, photo, SOURCE);

    expect(first.picture).toMatchObject({ width: 3840, height: 1670 });
    expect(await reUploaded(first.picture!, wide)).toEqual(first.picture!.bytes);
  });

  it("returns no picture for a solid colour, which the deck holds as a fill", async () => {
    const result = await changeBackground({
      pptxFile: await deck(),
      background: { kind: "colour", rgb: "1F2A44" },
      mode: "all-slides",
    });
    expect(result.picture).toBeNull();
  });
});
