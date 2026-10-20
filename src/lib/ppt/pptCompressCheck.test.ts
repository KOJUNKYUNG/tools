import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { JPEG_3x2, noisePng, solidPng, withExifOrientation } from "@/lib/pdf/testImages";
import { checkPptCompress } from "./pptCompressCheck";

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/** A 2-slide deck: slide 1 shows a noisy 40×20 PNG, slide 2 a 3×2 JPEG. */
async function syntheticDeck(jpeg: Uint8Array = JPEG_3x2): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx
    .addSlide()
    .addImage({ data: `image/png;base64,${b64(noisePng(40, 20))}`, x: 1, y: 1, w: 4, h: 2 });
  pptx
    .addSlide()
    .addImage({ data: `image/jpeg;base64,${b64(jpeg)}`, x: 1, y: 1, w: 3, h: 2 });
  // write() returns a union over every outputType; "uint8array" yields this one.
  return (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
}

async function mediaPath(deck: Uint8Array, ext: "png" | "jpeg"): Promise<string> {
  const pattern = ext === "png" ? /\.png$/ : /\.jpe?g$/;
  const zip = await JSZip.loadAsync(deck);
  const path = Object.keys(zip.files).find(
    (p) => p.startsWith("ppt/media/") && pattern.test(p),
  );
  if (!path) throw new Error(`no .${ext} media in the deck`);
  return path;
}

/** Rewrite the deck's parts as the engine does: same paths, new bytes. */
async function mutate(
  deck: Uint8Array,
  edit: (zip: JSZip) => Promise<void> | void,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(deck);
  await edit(zip);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** The deck with its noisy PNG recompressed to a flat one of the same size. */
async function compressed(deck: Uint8Array): Promise<Uint8Array> {
  const png = await mediaPath(deck, "png");
  return mutate(deck, (zip) => {
    zip.file(png, solidPng(40, 20), { compression: "STORE" });
  });
}

const request = { preset: "medium" } as const;
const properties = (vs: { property: string }[]) => vs.map((v) => v.property);

describe("checkPptCompress", () => {
  it("passes a deck whose images were recompressed in place", async () => {
    const deck = await syntheticDeck();
    const output = await compressed(deck);
    expect(output.byteLength).toBeLessThan(deck.byteLength);
    expect(await checkPptCompress(deck, request, output, "full")).toEqual([]);
  });

  it("flags an output no smaller than the input", async () => {
    const deck = await syntheticDeck();
    expect(properties(await checkPptCompress(deck, request, deck, "quick"))).toEqual([
      "size-bound",
    ]);
  });

  it("checks images in a media subfolder, as the engine recompresses them too", async () => {
    const nested = "ppt/media/sub/extra.png";
    const deck = await mutate(await syntheticDeck(), (zip) => {
      zip.file(nested, noisePng(40, 20));
    });
    const output = await mutate(await compressed(deck), (zip) => {
      zip.file(nested, solidPng(20, 40), { compression: "STORE" });
    });
    expect(await checkPptCompress(deck, request, output, "quick")).toEqual([
      { property: "media-dimensions", detail: `${nested}: 40×20 → 20×40` },
    ]);
  });

  it("flags a malformed XML part", async () => {
    const deck = await syntheticDeck();
    const output = await mutate(await compressed(deck), async (zip) => {
      const xml = await zip.file("ppt/slides/slide1.xml")!.async("text");
      zip.file("ppt/slides/slide1.xml", xml.replace("</p:sld>", ""));
    });
    expect(properties(await checkPptCompress(deck, request, output, "quick"))).toEqual([
      "xml-well-formed",
    ]);
  });

  it("flags a dropped entry and a dropped slide", async () => {
    const deck = await syntheticDeck();
    const png = await mediaPath(deck, "png");
    const noMedia = await mutate(await compressed(deck), (zip) => {
      zip.remove(png);
    });
    expect(properties(await checkPptCompress(deck, request, noMedia, "quick"))).toContain(
      "entry-set",
    );

    const noSlide = await mutate(await compressed(deck), (zip) => {
      zip.remove("ppt/slides/slide2.xml");
    });
    expect(properties(await checkPptCompress(deck, request, noSlide, "quick"))).toEqual(
      expect.arrayContaining(["entry-set", "slide-count"]),
    );
  });

  it("flags recompressed media whose header does not match its extension", async () => {
    const deck = await syntheticDeck();
    const png = await mediaPath(deck, "png");
    const output = await mutate(deck, (zip) => {
      zip.file(png, JPEG_3x2, { compression: "STORE" });
    });
    expect(properties(await checkPptCompress(deck, request, output, "quick"))).toEqual([
      "media-header",
    ]);
  });

  it("does not blame a mismatch the input already had", async () => {
    // The deck's .jpg holds PNG bytes; the engine left it as it was.
    const deck = await syntheticDeck(solidPng(3, 2));
    const output = await compressed(deck);
    expect(await checkPptCompress(deck, request, output, "full")).toEqual([]);
  });

  it("flags a recompressed image whose pixel size changed", async () => {
    const deck = await syntheticDeck();
    const png = await mediaPath(deck, "png");
    const output = await mutate(deck, (zip) => {
      zip.file(png, solidPng(20, 40), { compression: "STORE" });
    });
    expect(properties(await checkPptCompress(deck, request, output, "quick"))).toEqual([
      "media-dimensions",
    ]);
  });

  it.each([
    ["halved", 20, 10],
    ["scaled to a third, rounded on both sides", 13, 7],
    ["one pixel off on one side", 21, 10],
  ])("passes a picture downscaled in proportion (%s)", async (_, w, h) => {
    const deck = await syntheticDeck();
    const png = await mediaPath(deck, "png");
    const output = await mutate(deck, (zip) => {
      zip.file(png, solidPng(w, h), { compression: "STORE" });
    });
    expect(await checkPptCompress(deck, request, output, "quick")).toEqual([]);
  });

  it.each([
    ["distorted", 20, 5],
    ["enlarged", 80, 40],
    ["enlarged on one side only", 41, 20],
    ["turned a quarter", 20, 40],
    ["shrunk to nothing", 0, 0],
  ])("flags a recompressed picture %s", async (_, w, h) => {
    const deck = await syntheticDeck();
    const png = await mediaPath(deck, "png");
    const output = await mutate(deck, (zip) => {
      zip.file(png, solidPng(w, h), { compression: "STORE" });
    });
    expect(await checkPptCompress(deck, request, output, "quick")).toEqual([
      { property: "media-dimensions", detail: `${png}: 40×20 → ${w}×${h}` },
    ]);
  });

  it("compares sizes as displayed, after EXIF orientation", async () => {
    // Stored 3×2, shown 2×3.
    const deck = await syntheticDeck(withExifOrientation(JPEG_3x2, 6));
    const jpg = await mediaPath(deck, "jpeg");
    const replaceJpeg = async (bytes: Uint8Array) =>
      mutate(await compressed(deck), (zip) => {
        zip.file(jpg, bytes, { compression: "STORE" });
      });

    // Also shown 2×3: the picture keeps its shape on the slide.
    const turned = await replaceJpeg(withExifOrientation(JPEG_3x2, 8));
    expect(await checkPptCompress(deck, request, turned, "quick")).toEqual([]);

    // Shown 3×2: the tag was dropped without turning the pixels.
    const untagged = await replaceJpeg(JPEG_3x2);
    expect(properties(await checkPptCompress(deck, request, untagged, "quick"))).toEqual([
      "media-dimensions",
    ]);
  });

  it("flags an output that is not a zip", async () => {
    const deck = await syntheticDeck();
    const output = new Uint8Array(16);
    expect(properties(await checkPptCompress(deck, request, output, "quick"))).toEqual([
      "zip",
    ]);
  });
});
