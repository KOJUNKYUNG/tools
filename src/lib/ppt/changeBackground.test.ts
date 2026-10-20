import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INVALID_INPUT_PREFIX } from "@/lib/errors";
import type { CropRect } from "@/lib/image/maxFitCrop";
import type { PrepareSlideImage } from "@/lib/image/slideImage";
import { headerOnlyImage, standInPrepare } from "@/lib/image/slideImageStandIn";
import { changeBackground } from "./changeBackground";

/** A 2-slide deck at pptxgenjs's layout (16:9 by default). */
async function deck(layout: "LAYOUT_16x9" | "LAYOUT_4x3" = "LAYOUT_16x9"): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.layout = layout;
  for (let i = 1; i <= 2; i++) pptx.addSlide().addText(`Slide ${i}`, { x: 1, y: 1, w: 4, h: 1 });
  // write() returns a union over every outputType; "uint8array" yields this one.
  return (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
}

/** A phone photo's header: 4032 × 3024, upright. */
const PHOTO = headerOnlyImage("jpeg", { width: 4032, height: 3024 }, new Uint8Array([1]));

/** Stub the browser's Image element to report `width`×`height`, or fail to decode. */
function stubImage(width: number, height: number, decodes = true): void {
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = width;
      naturalHeight = height;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => (decodes ? this.onload : this.onerror)?.());
      }
    },
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
});

/** The stand-in preparer, recording the crop and slide it was given. */
function recordingPreparer(): { prepare: PrepareSlideImage; calls: Parameters<PrepareSlideImage>[] } {
  const calls: Parameters<PrepareSlideImage>[] = [];
  return {
    calls,
    prepare: async (...args) => {
      calls.push(args);
      return standInPrepare(...args);
    },
  };
}

async function run(
  input: Uint8Array,
  options: { crop?: CropRect; prepare?: PrepareSlideImage; image?: Uint8Array } = {},
): Promise<JSZip> {
  const output = await changeBackground({
    pptxFile: new File([new Uint8Array(input)], "deck.pptx"),
    bgImage: new File([new Uint8Array(options.image ?? PHOTO)], "photo.jpg"),
    mode: "all-slides",
    crop: options.crop,
    prepare: options.prepare ?? standInPrepare,
  });
  return JSZip.loadAsync(output);
}

const backgroundMedia = (zip: JSZip) =>
  Object.keys(zip.files).filter((p) => p.startsWith("ppt/media/background_custom"));

describe("changeBackground prepares the picture before embedding it", () => {
  it("embeds the prepared bytes, named and typed by the prepared format", async () => {
    stubImage(4032, 3024);
    const prepared = headerOnlyImage("jpeg", { width: 3840, height: 2160 }, new Uint8Array([7]));
    const zip = await run(await deck(), {
      prepare: async () => ({ bytes: prepared, format: "jpeg", width: 3840, height: 2160 }),
    });

    expect(backgroundMedia(zip)).toEqual(["ppt/media/background_custom.jpeg"]);
    expect(await zip.file("ppt/media/background_custom.jpeg")!.async("uint8array")).toEqual(prepared);
    const types = await zip.file("[Content_Types].xml")!.async("text");
    expect(types).toMatch(/<Default Extension="jpeg" ContentType="image\/jpeg"\/>/);
  });

  it("fills the slide with the picture, without fill offsets", async () => {
    stubImage(4032, 3024);
    const zip = await run(await deck());
    for (const n of [1, 2]) {
      const xml = await zip.file(`ppt/slides/slide${n}.xml`)!.async("text");
      expect(xml).toContain("<a:stretch><a:fillRect/></a:stretch>");
    }
  });

  it("without a crop, prepares the centred, largest crop of the slide's aspect", async () => {
    stubImage(4032, 3024);
    const wide = recordingPreparer();
    await run(await deck("LAYOUT_16x9"), { prepare: wide.prepare });
    expect(wide.calls.map(([, crop]) => crop)).toEqual([{ x: 0, y: 378, width: 4032, height: 2268 }]);

    stubImage(3024, 4032);
    const standard = recordingPreparer();
    await run(await deck("LAYOUT_4x3"), { prepare: standard.prepare });
    expect(standard.calls.map(([, crop]) => crop)).toEqual([{ x: 0, y: 882, width: 3024, height: 2268 }]);
  });

  it("prepares the crop it is given, for the deck's slide size", async () => {
    stubImage(4032, 3024);
    const crop = { x: 100, y: 50, width: 1600, height: 900 };
    const { prepare, calls } = recordingPreparer();
    await run(await deck(), { crop, prepare });
    expect(calls.map(([, c, slide]) => [c, slide])).toEqual([[crop, { w: 9144000, h: 5143500 }]]);
  });

  it("rejects a picture the browser cannot decode as invalid input", async () => {
    stubImage(0, 0, false);
    await expect(run(await deck())).rejects.toThrow(INVALID_INPUT_PREFIX);
  });
});
