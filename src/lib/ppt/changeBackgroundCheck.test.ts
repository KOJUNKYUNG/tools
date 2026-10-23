import { resolveObjectURL } from "node:buffer";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { maxFitCrop } from "@/lib/image/maxFitCrop";
import { headerOnlyImage, standInPrepare } from "@/lib/image/slideImageStandIn";
import { testPng } from "@/lib/image/testPng";
import { displayedSize, readImageHeader } from "@/lib/output-check/imageHeader";
import { openPptxPackage } from "@/lib/output-check/pptxPackage";
import { changeBackground } from "./changeBackground";
import {
  clickAnimations,
  filledShape,
  picture as pictureElement,
  solidBackground,
  solidFill,
  testDeck,
  textBox,
} from "./testDeck";
import {
  checkPptBackground,
  type PptBackgroundRequest,
} from "./changeBackgroundCheck";

// Two distinct tiny PNGs: OLD is a background already in the input deck,
// NEW is the background the user applies.
const OLD_BG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGNkYGD4z4AEGEkUAACk0gMB/9eeLwAAAABJRU5ErkJggg==";
const NEW_BG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8DwnwEJMJIoAACkrwMBhE8mKwAAAABJRU5ErkJggg==";

const newBgBytes = Uint8Array.from(Buffer.from(NEW_BG, "base64"));

/** A 3-slide deck, 16:9 or 9:16; slide 2 carries its own picture background. */
async function syntheticDeck(portrait = false): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  if (portrait) {
    pptx.defineLayout({ name: "PORTRAIT", width: 5.625, height: 10 });
    pptx.layout = "PORTRAIT";
  }
  for (let i = 1; i <= 3; i++) {
    const slide = pptx.addSlide();
    if (i === 2) slide.background = { data: `image/png;base64,${OLD_BG}` };
    slide.addText(`Slide ${i}`, { x: 1, y: 1, w: 4, h: 1 });
  }
  // write() returns a union over every outputType; "uint8array" yields this one.
  return (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
}

/** What the user asks for; the engine adds the prepared picture. */
type Intent = Omit<PptBackgroundRequest, "background">;

async function apply(deck: Uint8Array, intent: Intent): Promise<Uint8Array> {
  return changeBackground({
    pptxFile: new File([new Uint8Array(deck)], "deck.pptx"),
    bgImage: new File([new Uint8Array(intent.source)], "bg.png"),
    mode: intent.mode,
    targetSlides: intent.targetSlides,
    crop: intent.crop,
    keptCovering: intent.keptCovering,
    prepare: standInPrepare,
  });
}

/** The 16:9 slide of every `syntheticDeck`, in EMU. */
const SLIDE = { w: 9144000, h: 5143500 };

/**
 * The full request for `intent` on a 16:9 deck: the picture the engine should
 * have embedded, as the stand-in prepares it from the default (or given) crop.
 */
async function requestFor(intent: Intent): Promise<PptBackgroundRequest> {
  const [w, h] = displayedSize(readImageHeader(intent.source)!);
  const crop = intent.crop ?? maxFitCrop({ w, h }, SLIDE.w, SLIDE.h);
  const { bytes } = await standInPrepare(new Blob([new Uint8Array(intent.source)]), crop, SLIDE);
  return { ...intent, background: bytes };
}

/**
 * Rewrite one output part, keeping everything else byte-for-byte: the deck
 * is deflated, so DEFLATE copies the untouched parts' compressed bytes, as
 * the engine does. The checker then skips those parts, so each test also
 * proves the edited part is still read.
 */
async function mutate(
  bytes: Uint8Array,
  edit: (zip: JSZip) => Promise<void> | void,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  await edit(zip);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** Append a relationship to a part that points at a missing media part. */
async function addDanglingRelationship(zip: JSZip, relsPath: string): Promise<void> {
  const xml = await zip.file(relsPath)!.async("text");
  zip.file(
    relsPath,
    xml.replace(
      "</Relationships>",
      '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/missing.png"/></Relationships>',
    ),
  );
}

/** Append an image relationship the part itself never names. */
async function addImageRelationship(
  zip: JSZip,
  relsPath: string,
  id: string,
  target: string,
): Promise<void> {
  const xml = await zip.file(relsPath)!.async("text");
  zip.file(
    relsPath,
    xml.replace(
      "</Relationships>",
      `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/></Relationships>`,
    ),
  );
}

/** Slide 2's own background in `syntheticDeck`, as pptxgenjs writes it. */
const OLD_BG_REL = "rId1";
const OLD_BG_MEDIA = "ppt/media/Slide-2-image-1.png";
const SLIDE2_RELS = "ppt/slides/_rels/slide2.xml.rels";

/** Put slide 2's replaced background relationship (and its media) back. */
async function restoreOldBackground(zip: JSZip, input: Uint8Array): Promise<void> {
  const original = await JSZip.loadAsync(input);
  const oldRels = await original.file(SLIDE2_RELS)!.async("text");
  const rel = oldRels.match(new RegExp(`<Relationship\\b[^>]*Id="${OLD_BG_REL}"[^>]*/>`))![0];
  const xml = await zip.file(SLIDE2_RELS)!.async("text");
  // The engine never reuses an id, so the old one is free in the output.
  zip.file(SLIDE2_RELS, xml.replace("</Relationships>", `${rel}</Relationships>`));
  zip.file(OLD_BG_MEDIA, await original.file(OLD_BG_MEDIA)!.async("uint8array"));
}

/** `ppt/media/` parts of a deck. */
async function mediaParts(deck: Uint8Array): Promise<string[]> {
  const pkg = await openPptxPackage(deck);
  return pkg!.parts.filter((p) => /^ppt\/media\/[^/]+$/.test(p)).sort();
}

async function properties(
  input: Uint8Array,
  intent: Intent,
  output: Uint8Array,
): Promise<string[]> {
  const violations = await checkPptBackground(input, await requestFor(intent), output, "full");
  return violations.map((v) => v.property);
}

async function quick(input: Uint8Array, intent: Intent, output: Uint8Array) {
  return checkPptBackground(input, await requestFor(intent), output, "quick");
}

// The engine measures the background image with the browser's Image element;
// Node has none, so stand in a decoder that reads the size from the PNG
// header behind the object URL. Everything else in the engine runs for real.
beforeAll(() => {
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(url: string) {
        void (async () => {
          const blob = resolveObjectURL(url);
          if (!blob) throw new Error(`no blob behind ${url}`);
          const bytes = new DataView(await blob.arrayBuffer());
          this.naturalWidth = bytes.getUint32(16);
          this.naturalHeight = bytes.getUint32(20);
          this.onload?.();
        })().catch(() => this.onerror?.());
      }
    },
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const allSlides: Intent = { source: newBgBytes, mode: "all-slides" };

describe("checkPptBackground flags broken output", () => {
  it("flags a deck that lost a slide", async () => {
    const input = await syntheticDeck();
    const good = await apply(input, allSlides);
    const broken = await mutate(good, (zip) => {
      zip.remove("ppt/slides/slide3.xml");
    });
    expect(await properties(input, allSlides, broken)).toContain("slide-count");
  });

  it("flags a part that is not well-formed XML", async () => {
    const input = await syntheticDeck();
    const good = await apply(input, allSlides);
    const broken = await mutate(good, async (zip) => {
      const xml = await zip.file("ppt/slides/slide2.xml")!.async("text");
      zip.file("ppt/slides/slide2.xml", xml.replace("</p:cSld>", ""));
    });
    expect(await properties(input, allSlides, broken)).toContain("xml-well-formed");
  });

  it("flags a part [Content_Types].xml does not cover", async () => {
    const input = await syntheticDeck();
    const good = await apply(input, allSlides);
    const broken = await mutate(good, async (zip) => {
      const xml = await zip.file("[Content_Types].xml")!.async("text");
      zip.file(
        "[Content_Types].xml",
        // Drop the declaration that covers the .jpeg background media.
        xml.replace(/<Default[^>]*Extension="jpeg"[^>]*\/>/, ""),
      );
    });
    expect(await properties(input, allSlides, broken)).toContain("content-type");
  });

  it("flags a relationship whose target part is missing", async () => {
    const input = await syntheticDeck();
    const good = await apply(input, allSlides);
    const broken = await mutate(good, (zip) =>
      addDanglingRelationship(zip, "ppt/slides/_rels/slide1.xml.rels"),
    );
    expect(await properties(input, allSlides, broken)).toContain("relationship-target");
  });

  it("flags a target slide that does not show the new background", async () => {
    const input = await syntheticDeck();
    const good = await apply(input, allSlides);
    const original = await JSZip.loadAsync(input);
    const broken = await mutate(good, async (zip) => {
      // Slide 2 keeps its old background, as if the engine skipped it.
      for (const p of ["ppt/slides/slide2.xml", SLIDE2_RELS, OLD_BG_MEDIA]) {
        zip.file(p, await original.file(p)!.async("uint8array"));
      }
    });
    expect(await quick(input, allSlides, broken)).toEqual([
      { property: "target-background", detail: "ppt/slides/slide2.xml" },
    ]);
  });

  it("flags a target whose background is an image other than the new one", async () => {
    const input = await syntheticDeck();
    const good = await apply(input, allSlides);
    const broken = await mutate(good, async (zip) => {
      const media = Object.keys(zip.files).find((p) => p.includes("background_custom"))!;
      zip.file(media, Buffer.from(OLD_BG, "base64"));
    });
    expect(await properties(input, allSlides, broken)).toContain("target-background");
  });

  it("flags a slide the user did not target that changed, at full depth only", async () => {
    const request: Intent = {
      source: newBgBytes,
      mode: "specific-slides",
      targetSlides: [1],
    };
    const input = await syntheticDeck();
    const good = await apply(input, request);
    const broken = await mutate(good, async (zip) => {
      const xml = await zip.file("ppt/slides/slide3.xml")!.async("text");
      zip.file("ppt/slides/slide3.xml", xml.replace("Slide 3", "Slide three"));
    });
    expect(await properties(input, request, broken)).toEqual(["non-target-unchanged"]);
    // Byte identity is a regression-set property, not a run-time one.
    expect(await quick(input, request, broken)).toEqual([]);
  });

  it("flags a compressed part whose data is corrupt (reading it throws)", async () => {
    const input = await syntheticDeck();
    const good = await apply(input, allSlides);
    const zip = await JSZip.loadAsync(good);
    const broken = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    // Overwrite the middle of slide2.xml's compressed data in its local entry.
    const name = new TextEncoder().encode("ppt/slides/slide2.xml");
    const at = broken.findIndex(
      (_, i) =>
        broken[i - 30] === 0x50 &&
        broken[i - 29] === 0x4b &&
        broken[i - 28] === 0x03 &&
        broken[i - 27] === 0x04 &&
        name.every((b, j) => broken[i + j] === b),
    );
    const extraLength = broken[at - 4] | (broken[at - 3] << 8);
    const dataStart = at + name.length + extraLength;
    for (let i = dataStart + 10; i < dataStart + 40; i++) broken[i] ^= 0xff;

    expect(await properties(input, allSlides, broken)).toContain("part-readable");
  });

  it("flags a target slide that keeps its replaced background's relationship", async () => {
    const input = await syntheticDeck();
    const good = await apply(input, allSlides);
    const broken = await mutate(good, (zip) => restoreOldBackground(zip, input));
    // Run time: the old image would stay embedded and grow the deck.
    expect(await quick(input, allSlides, broken)).toEqual([
      {
        property: "replaced-background-kept",
        detail: `${SLIDE2_RELS} ${OLD_BG_REL} → ${OLD_BG_MEDIA}`,
      },
    ]);
  });

  it("flags a background image nothing references, at full depth only", async () => {
    const input = await syntheticDeck();
    const good = await apply(input, allSlides);
    const broken = await mutate(good, (zip) => {
      zip.file(OLD_BG_MEDIA, Buffer.from(OLD_BG, "base64"));
    });
    expect(await properties(input, allSlides, broken)).toEqual(["media-unreferenced"]);
    expect(await quick(input, allSlides, broken)).toEqual([]);
  });

  it("flags an unused image relationship in any part, at full depth only", async () => {
    const request: Intent = {
      source: newBgBytes,
      mode: "specific-slides",
      targetSlides: [1],
    };
    const input = await syntheticDeck();
    const good = await apply(input, request);
    // The layout is untargeted and its bytes are copied: the check still reads it.
    const broken = await mutate(good, async (zip) => {
      const relsPath = "ppt/slideLayouts/_rels/slideLayout1.xml.rels";
      const xml = await zip.file(relsPath)!.async("text");
      zip.file(
        relsPath,
        xml.replace(
          "</Relationships>",
          '<Relationship Id="rId98" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/Slide-2-image-1.png"/></Relationships>',
        ),
      );
    });
    // An untargeted layout that changed is reported as well.
    expect(await properties(input, request, broken)).toEqual(["relationship-unused", "non-target-unchanged"]);
    expect(await quick(input, request, broken)).toEqual([]);
  });

  it("flags output larger than input + new image − removed media, at full depth only", async () => {
    const input = await syntheticDeck();
    const good = await apply(input, allSlides);
    const broken = await mutate(good, async (zip) => {
      // Bloat a part the deck uses: random bytes do not compress.
      const filler = crypto.getRandomValues(new Uint8Array(60_000));
      const xml = await zip.file("docProps/core.xml")!.async("text");
      zip.file(
        "docProps/core.xml",
        xml.replace(/<\/cp:coreProperties>\s*$/, `<!--${Buffer.from(filler).toString("base64")}--></cp:coreProperties>`),
      );
    });
    expect(await properties(input, allSlides, broken)).toEqual(["size-bound"]);
    expect(await quick(input, allSlides, broken)).toEqual([]);
  });

  it("flags output that is not a zip at all", async () => {
    const input = await syntheticDeck();
    const garbage = new TextEncoder().encode("not a pptx");
    expect(await properties(input, allSlides, garbage)).toEqual(["zip"]);
  });
});

describe("checkPptBackground checks the prepared picture", () => {
  /** A picture's header at `width`×`height`; the tag keeps sizes apart. */
  const picture = (width: number, height: number) =>
    headerOnlyImage("png", { width, height }, new Uint8Array([width % 256, height % 256]));

  /**
   * The quick-depth properties when the preparer had produced `prepared`:
   * the deck embeds it and the request claims it, so only the picture is off.
   */
  async function preparedAs(intent: Intent, prepared: Uint8Array, portrait = false) {
    const input = await syntheticDeck(portrait);
    const output = await mutate(await apply(input, intent), (zip) => {
      const media = Object.keys(zip.files).find((p) => p.includes("background_custom"))!;
      zip.file(media, prepared);
    });
    const request: PptBackgroundRequest = { ...intent, background: prepared };
    const violations = await checkPptBackground(input, request, output, "quick");
    return violations.map((v) => v.property);
  }

  it("passes a phone photo cut and fitted for a 16:9 slide", async () => {
    const intent: Intent = { source: picture(4032, 3024), mode: "all-slides" };
    const input = await syntheticDeck();
    expect(await properties(input, intent, await apply(input, intent))).toEqual([]);
  });

  it("passes a given crop smaller than the box, kept at its own size", async () => {
    const intent: Intent = {
      source: picture(4032, 3024),
      crop: { x: 1000, y: 500, width: 1600, height: 900 },
      mode: "all-slides",
    };
    const input = await syntheticDeck();
    expect(await properties(input, intent, await apply(input, intent))).toEqual([]);
  });

  it("flags a picture of another aspect than the slide", async () => {
    const intent: Intent = { source: picture(4032, 3024), mode: "all-slides" };
    expect(await preparedAs(intent, picture(2880, 2160))).toEqual(["background-aspect"]);
  });

  it("flags a picture off the slide's aspect by more than 1 px on either side", async () => {
    const intent: Intent = { source: picture(4032, 3024), mode: "all-slides" };
    // 901 high wants 1601.8 wide: the width is 1.8 px short, the height only 1 px over.
    expect(await preparedAs(intent, picture(1600, 901))).toEqual(["background-aspect"]);
  });

  it("flags a prepared picture that is not a readable PNG or JPEG", async () => {
    const intent: Intent = { source: picture(4032, 3024), mode: "all-slides" };
    expect(await preparedAs(intent, new TextEncoder().encode("not an image"))).toEqual([
      "background-format",
    ]);
  });

  it("flags a picture whose alpha is used, turned JPEG", async () => {
    /** A real 64 × 48 PNG whose last pixel has this alpha. */
    const source = (alpha: number) =>
      testPng({
        width: 64,
        height: 48,
        colorType: 6,
        pixel: (x, y) => [x, y, 0, x === 63 && y === 47 ? alpha : 255],
      });
    const preparedIn = (format: "png" | "jpeg") =>
      headerOnlyImage(format, { width: 64, height: 36 }, new Uint8Array([9]));
    const transparent: Intent = { source: source(0), mode: "all-slides" };
    const opaque: Intent = { source: source(255), mode: "all-slides" };

    expect(await preparedAs(transparent, preparedIn("jpeg"))).toEqual(["background-format"]);
    expect(await preparedAs(transparent, preparedIn("png"))).toEqual([]);
    expect(await preparedAs(opaque, preparedIn("jpeg"))).toEqual([]);
  });

  it("flags a picture larger than a 4K screen needs", async () => {
    const intent: Intent = { source: picture(8000, 4500), mode: "all-slides" };
    expect(await preparedAs(intent, picture(4000, 2250))).toEqual(["background-cap"]);
  });

  it("holds a portrait slide's picture to 2160 × 3840", async () => {
    const intent: Intent = { source: picture(4500, 8000), mode: "all-slides" };
    expect(await preparedAs(intent, picture(2160, 3840), true)).toEqual([]);
    expect(await preparedAs(intent, picture(2250, 4000), true)).toEqual(["background-cap"]);
  });

  it("flags a picture enlarged past the default crop", async () => {
    const intent: Intent = { source: picture(1600, 1200), mode: "all-slides" };
    // The centred 16:9 crop of 1600 × 1200 is 1600 × 900.
    expect(await preparedAs(intent, picture(1600, 900))).toEqual([]);
    expect(await preparedAs(intent, picture(1920, 1080))).toEqual(["background-not-upscaled"]);
  });

  it("flags a picture enlarged past the crop it was given", async () => {
    const intent: Intent = {
      source: picture(4032, 3024),
      crop: { x: 0, y: 0, width: 800, height: 450 },
      mode: "all-slides",
    };
    expect(await preparedAs(intent, picture(1600, 900))).toEqual(["background-not-upscaled"]);
  });
});

describe("checkPptBackground passes good output", () => {
  const modes: [string, Intent][] = [
    ["all slides", allSlides],
    ["the master", { source: newBgBytes, mode: "master" }],
    ["specific slides", { source: newBgBytes, mode: "specific-slides", targetSlides: [1, 3] }],
  ];
  it.each(modes)("reports nothing when applied to %s", async (_, request) => {
    const input = await syntheticDeck();
    const output = await apply(input, request);
    expect(await properties(input, request, output)).toEqual([]);
  });
});

describe("ppt-background removes the replaced background", () => {
  const oldBgBytes = Uint8Array.from(Buffer.from(OLD_BG, "base64"));

  /** The media part each slide's background points at. */
  async function slideBackgrounds(deck: Uint8Array): Promise<(string | null)[]> {
    const pkg = (await openPptxPackage(deck))!;
    const media = await pkg.backgroundMedia(pkg.slideParts);
    return pkg.slideParts.map((p) => media.get(p) ?? null);
  }

  it("deletes the replaced image when nothing else uses it", async () => {
    const input = await syntheticDeck();
    const output = await apply(input, allSlides);
    expect(await mediaParts(output)).not.toContain(OLD_BG_MEDIA);
    expect(await properties(input, allSlides, output)).toEqual([]);
  });

  it("removes every relationship the old background used (SVG variant, either quote)", async () => {
    // PowerPoint stores an SVG background as a PNG blip plus an SVG blip with
    // its own relationship. Leaving the second behind would block a good deck.
    const svg = "ppt/media/bg.svg";
    const clean = await syntheticDeck();
    const input = await mutate(clean, async (zip) => {
      const slide = await zip.file("ppt/slides/slide2.xml")!.async("text");
      zip.file(
        "ppt/slides/slide2.xml",
        slide.replace(
          `<a:blip r:embed="${OLD_BG_REL}"><a:lum/></a:blip>`,
          `<a:blip r:embed='${OLD_BG_REL}'><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">` +
            `<asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rId9"/>` +
            `</a:ext></a:extLst></a:blip>`,
        ),
      );
      const rels = await zip.file(SLIDE2_RELS)!.async("text");
      zip.file(
        SLIDE2_RELS,
        rels.replace(
          "</Relationships>",
          '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/bg.svg"/></Relationships>',
        ),
      );
      zip.file(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>');
      const types = await zip.file("[Content_Types].xml")!.async("text");
      zip.file(
        "[Content_Types].xml",
        types.replace("</Types>", '<Default Extension="svg" ContentType="image/svg+xml"/></Types>'),
      );
    });
    const output = await apply(input, allSlides);
    expect(await mediaParts(output)).not.toContain(svg);
    expect(await mediaParts(output)).not.toContain(OLD_BG_MEDIA);
    expect(await properties(input, allSlides, output)).toEqual([]);
  });

  it("clears image relationships a target slide never uses, such as leftovers of earlier runs", async () => {
    // Older versions left the replaced background's relationship behind.
    // Slide 1 (targeted) and slide 3 (not) both carry such a leftover.
    const leftover = "ppt/media/leftover.png";
    const clean = await syntheticDeck();
    const input = await mutate(clean, async (zip) => {
      zip.file(leftover, Buffer.from(OLD_BG, "base64"));
      for (const n of [1, 3]) await addImageRelationship(zip, `ppt/slides/_rels/slide${n}.xml.rels`, "rId97", "../media/leftover.png");
    });
    const firstOnly: Intent = {
      source: newBgBytes,
      mode: "specific-slides",
      targetSlides: [1],
    };
    const partly = await apply(input, firstOnly);
    const unused = await (await openPptxPackage(partly))!.unusedRelationships();
    // Slide 3 was not targeted, so its leftover stays and keeps the image.
    expect(unused.map((v) => v.detail)).toEqual([
      "ppt/slides/_rels/slide3.xml.rels rId97 → ppt/media/leftover.png",
    ]);
    expect(await mediaParts(partly)).toContain(leftover);
    expect(await properties(input, firstOnly, partly)).toEqual([]);

    // Targeting every slide clears both, and the image goes with them.
    const all = await apply(input, allSlides);
    expect(await (await openPptxPackage(all))!.unusedRelationships()).toEqual([]);
    expect(await mediaParts(all)).not.toContain(leftover);
    expect(await properties(input, allSlides, all)).toEqual([]);
  });

  it("drops a content-type override that named the deleted image", async () => {
    const clean = await syntheticDeck();
    const input = await mutate(clean, async (zip) => {
      const xml = await zip.file("[Content_Types].xml")!.async("text");
      zip.file(
        "[Content_Types].xml",
        xml.replace("</Types>", `<Override PartName="/${OLD_BG_MEDIA}" ContentType="image/png"/></Types>`),
      );
    });
    const output = await apply(input, allSlides);
    const types = await (await JSZip.loadAsync(output)).file("[Content_Types].xml")!.async("text");
    expect(types).not.toContain(OLD_BG_MEDIA);
    expect(await properties(input, allSlides, output)).toEqual([]);
  });

  it("leaves one background media per distinct background after re-applying", async () => {
    const input = await syntheticDeck();
    const once = await apply(input, allSlides);
    const again: Intent = { source: oldBgBytes, mode: "all-slides" };
    const twice = await apply(once, again);

    const inUse = [...new Set(await slideBackgrounds(twice))];
    expect(inUse).toHaveLength(1);
    expect(await mediaParts(twice)).toEqual(inUse);
    expect(await properties(once, again, twice)).toEqual([]);
  });

  it("keeps a background that untargeted slides still use (specific slides)", async () => {
    const input = await syntheticDeck();
    const shared = await apply(input, allSlides);
    const [sharedMedia] = await slideBackgrounds(shared);

    const first: Intent = {
      source: oldBgBytes,
      mode: "specific-slides",
      targetSlides: [1],
    };
    const partly = await apply(shared, first);
    const backgrounds = await slideBackgrounds(partly);
    expect(backgrounds[0]).not.toBe(sharedMedia);
    expect(backgrounds.slice(1)).toEqual([sharedMedia, sharedMedia]);
    expect(await mediaParts(partly)).toContain(sharedMedia);
    expect(await properties(shared, first, partly)).toEqual([]);

    // Once the last slide using it is changed, the shared image goes too.
    const rest: Intent = { ...first, targetSlides: [2, 3] };
    const done = await apply(partly, rest);
    expect(await mediaParts(done)).not.toContain(sharedMedia);
    expect(await properties(partly, rest, done)).toEqual([]);
  });

  it("keeps the old image when the target slide still shows it elsewhere", async () => {
    const clean = await syntheticDeck();
    // Slide 2 also shows its background image as a picture, through the same id.
    const pic =
      `<p:pic><p:nvPicPr><p:cNvPr id="9" name="Picture"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>` +
      `<p:blipFill><a:blip r:embed="${OLD_BG_REL}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
      `<p:spPr/></p:pic>`;
    const input = await mutate(clean, async (zip) => {
      const xml = await zip.file("ppt/slides/slide2.xml")!.async("text");
      zip.file("ppt/slides/slide2.xml", xml.replace("</p:spTree>", `${pic}</p:spTree>`));
    });
    const output = await apply(input, allSlides);
    expect(await mediaParts(output)).toContain(OLD_BG_MEDIA);
    expect(await properties(input, allSlides, output)).toEqual([]);
  });
});

describe("checkPptBackground does not blame the tool for the input", () => {
  it("ignores a defect the input deck already had", async () => {
    // A deck PowerPoint opened despite a dangling relationship: the defect is
    // the user's file, not ppt-background's output.
    const clean = await syntheticDeck();
    const input = await mutate(clean, (zip) =>
      addDanglingRelationship(zip, "ppt/slides/_rels/slide3.xml.rels"),
    );
    const output = await apply(input, allSlides);
    expect(await properties(input, allSlides, output)).toEqual([]);
  });

  it("ignores an orphaned image and an unused relationship the input already had", async () => {
    const clean = await syntheticDeck();
    const input = await mutate(clean, async (zip) => {
      zip.file("ppt/media/orphan.png", Buffer.from(OLD_BG, "base64"));
      // The layout is never a target, so its unused relationship survives.
      await addImageRelationship(
        zip,
        "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
        "rId97",
        "../media/Slide-2-image-1.png",
      );
    });
    const output = await apply(input, allSlides);
    expect(await properties(input, allSlides, output)).toEqual([]);
    expect(await quick(input, allSlides, output)).toEqual([]);
  });

  it("ignores a malformed part the input already had, whether copied or rewritten", async () => {
    // Unclose the self-closing root element: a reader rejects the part.
    const malformed = (xml: string) => xml.replace(/\/>\s*$/, ">");
    const clean = await syntheticDeck();
    const input = await mutate(clean, async (zip) => {
      const xml = await zip.file("ppt/presProps.xml")!.async("text");
      zip.file("ppt/presProps.xml", malformed(xml));
    });
    const inputDefects = await (await openPptxPackage(input))!.structuralDefects();
    expect(inputDefects.map((d) => d.property)).toEqual(["xml-well-formed"]);

    const copied = await apply(input, allSlides);
    expect(await properties(input, allSlides, copied)).toEqual([]);

    // Stored afresh (other bytes), the same text still carries the same defect.
    // Stored uncompressed, the deck rightly outgrows the size bound.
    const rewritten = await JSZip.loadAsync(copied).then((zip) =>
      zip.generateAsync({ type: "uint8array" }),
    );
    expect(await properties(input, allSlides, rewritten)).toEqual(["size-bound"]);
  });
});

describe("checkPptBackground checks covering backgrounds", () => {
  /** Slide 1: an old background picture under the lyrics, the lyrics animated. */
  const coveredDeck = () =>
    testDeck([
      {
        shapes: [pictureElement(2, "rId10"), textBox(9, "가사")],
        pictures: { rId10: "old.png" },
        timing: clickAnimations([9]),
      },
    ]);
  const SLIDE1 = "ppt/slides/slide1.xml";

  /** Rewrite slide 1 of `deck`. */
  const editSlide1 = (deck: Uint8Array, edit: (xml: string) => string) =>
    mutate(deck, async (zip) => {
      zip.file(SLIDE1, edit(await zip.file(SLIDE1)!.async("text")));
    });

  it("passes the engine's output", async () => {
    const input = await coveredDeck();
    const output = await apply(input, allSlides);
    expect(await properties(input, allSlides, output)).toEqual([]);
  });

  it("passes a deck whose covering background shares a shape id with the content", async () => {
    // Producers write duplicate ids; PowerPoint repairs them silently.
    const input = await testDeck([
      { shapes: [pictureElement(2, "rId10"), textBox(2, "가사")], pictures: { rId10: "old.png" } },
    ]);
    const output = await apply(input, allSlides);
    expect(await properties(input, allSlides, output)).toEqual([]);
  });

  it("flags a covering background left on a target slide", async () => {
    const input = await coveredDeck();
    const output = await editSlide1(await apply(input, allSlides), (xml) =>
      xml.replace("</p:grpSpPr>", `</p:grpSpPr>${pictureElement(2, "rId10")}`),
    );
    expect(await quick(input, allSlides, output)).toContainEqual({
      property: "covering-background-kept",
      detail: `${SLIDE1} #2`,
    });
  });

  it("flags another top-level element missing from a target slide", async () => {
    const input = await coveredDeck();
    const output = await editSlide1(await apply(input, allSlides), (xml) =>
      xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/, ""),
    );
    expect(await quick(input, allSlides, output)).toContainEqual({
      property: "element-missing",
      detail: `${SLIDE1} #9`,
    });
  });

  it("flags an animation naming a shape the slide does not have", async () => {
    const input = await coveredDeck();
    const output = await editSlide1(await apply(input, allSlides), (xml) =>
      xml.replace(/<p:bldP spid="9"/, '<p:bldP spid="2"'),
    );
    expect(await quick(input, allSlides, output)).toEqual([
      { property: "animation-target-missing", detail: `${SLIDE1} spid 2` },
    ]);
  });

  describe("with a group the user keeps", () => {
    /** Slide 1's covering background is kept, slide 2's is deleted. */
    const twoGroups = () =>
      testDeck([
        { shapes: [pictureElement(2, "rId10"), textBox(9, "1절")], pictures: { rId10: "keep.png" } },
        { shapes: [pictureElement(2, "rId10"), textBox(9, "2절")], pictures: { rId10: "old.png" } },
      ]);
    const keeping = (mode: Intent["mode"]): Intent => ({
      source: newBgBytes,
      mode,
      keptCovering: ["covering:ppt/media/keep.png"],
    });

    it.each(["all-slides", "master"] as const)("passes the engine's output (%s)", async (mode) => {
      const input = await twoGroups();
      expect(await properties(input, keeping(mode), await apply(input, keeping(mode)))).toEqual([]);
    });

    it("flags a kept covering background that was deleted", async () => {
      const input = await twoGroups();
      const output = await editSlide1(await apply(input, keeping("all-slides")), (xml) =>
        xml.replace(/<p:pic>[\s\S]*?<\/p:pic>/, ""),
      );
      expect(await quick(input, keeping("all-slides"), output)).toContainEqual({
        property: "element-missing",
        detail: `${SLIDE1} #2`,
      });
    });

    it("flags a covering background of another group left in place", async () => {
      const input = await twoGroups();
      const output = await mutate(await apply(input, keeping("all-slides")), async (zip) => {
        const part = "ppt/slides/slide2.xml";
        const xml = await zip.file(part)!.async("text");
        zip.file(part, xml.replace("</p:grpSpPr>", `</p:grpSpPr>${pictureElement(2, "rId10")}`));
      });
      expect(await quick(input, keeping("all-slides"), output)).toContainEqual({
        property: "covering-background-kept",
        detail: "ppt/slides/slide2.xml #2",
      });
    });
  });

  it("ignores an animation target the input already lacked", async () => {
    const input = await editSlide1(await coveredDeck(), (xml) =>
      xml.replace(/<p:bldP spid="9"/, '<p:bldP spid="77"'),
    );
    expect(await properties(input, allSlides, await apply(input, allSlides))).toEqual([]);
  });
});

describe("checkPptBackground checks fill-form covering backgrounds", () => {
  /** Slide 1: a plain rectangle under the lyrics, filled by its style reference; slide 2: a solid one, kept. */
  const filledDeck = () =>
    testDeck([
      { shapes: [filledShape(2, null), textBox(9, "1절")], timing: clickAnimations([2, 9]) },
      { shapes: [filledShape(2, solidFill("1F2D3A")), textBox(9, "2절")] },
    ]);
  const keepSolid = (mode: Intent["mode"]): Intent => ({ source: newBgBytes, mode, keptCovering: ["covering:#1f2d3a"] });
  const SLIDE1 = "ppt/slides/slide1.xml";
  const SLIDE2 = "ppt/slides/slide2.xml";

  it.each(["all-slides", "master"] as const)("passes the engine's output (%s)", async (mode) => {
    const input = await filledDeck();
    expect(await properties(input, keepSolid(mode), await apply(input, keepSolid(mode)))).toEqual([]);
  });

  it("flags a rectangle filled by its style reference left in place", async () => {
    const input = await filledDeck();
    const output = await mutate(await apply(input, keepSolid("all-slides")), async (zip) => {
      const xml = await zip.file(SLIDE1)!.async("text");
      zip.file(SLIDE1, xml.replace("</p:grpSpPr>", `</p:grpSpPr>${filledShape(2, null)}`));
    });
    expect(await quick(input, keepSolid("all-slides"), output)).toContainEqual({
      property: "covering-background-kept",
      detail: `${SLIDE1} #2`,
    });
  });

  it("flags a kept solid rectangle that was deleted", async () => {
    const input = await filledDeck();
    const output = await mutate(await apply(input, keepSolid("all-slides")), async (zip) => {
      const xml = await zip.file(SLIDE2)!.async("text");
      zip.file(SLIDE2, xml.replace(/<p:sp><p:nvSpPr><p:cNvPr id="2"[\s\S]*?<\/p:sp>/, ""));
    });
    expect(await quick(input, keepSolid("all-slides"), output)).toContainEqual({
      property: "element-missing",
      detail: `${SLIDE2} #2`,
    });
  });
});

describe("checkPptBackground checks master mode", () => {
  const masterMode: Intent = { source: newBgBytes, mode: "master" };
  const SLIDE2 = "ppt/slides/slide2.xml";
  const LAYOUT1 = "ppt/slideLayouts/slideLayout1.xml";

  /** Put `bg` back as the part's own background. */
  const declareBackground = (deck: Uint8Array, part: string, bg: string) =>
    mutate(deck, async (zip) => {
      const xml = await zip.file(part)!.async("text");
      zip.file(part, xml.replace(/(<p:cSld\b[^>]*>)/, `$1${bg}`));
    });
  const solid = solidBackground("1F3864");

  it("flags a slide that keeps its own background", async () => {
    const input = await syntheticDeck();
    const output = await declareBackground(await apply(input, masterMode), SLIDE2, solid);
    expect(await quick(input, masterMode, output)).toEqual([
      { property: "own-background-kept", detail: SLIDE2 },
    ]);
  });

  it("flags a layout that keeps its own background", async () => {
    const input = await syntheticDeck();
    const output = await declareBackground(await apply(input, masterMode), LAYOUT1, solid);
    expect(await quick(input, masterMode, output)).toEqual([
      { property: "own-background-kept", detail: LAYOUT1 },
    ]);
  });

  it("flags a covering background left on any slide", async () => {
    const input = await testDeck([
      { shapes: [textBox(9, "제목")] },
      { shapes: [pictureElement(2, "rId10"), textBox(9, "가사")], pictures: { rId10: "old.png" } },
    ]);
    const output = await mutate(await apply(input, masterMode), async (zip) => {
      const xml = await zip.file(SLIDE2)!.async("text");
      zip.file(SLIDE2, xml.replace("</p:grpSpPr>", `</p:grpSpPr>${pictureElement(2, "rId10")}`));
    });
    expect(await quick(input, masterMode, output)).toContainEqual({
      property: "covering-background-kept",
      detail: `${SLIDE2} #2`,
    });
  });

  it("flags a slide or layout changed beyond its own background, at full depth only", async () => {
    const input = await syntheticDeck();
    const output = await mutate(await apply(input, masterMode), async (zip) => {
      for (const part of [SLIDE2, LAYOUT1]) {
        const xml = await zip.file(part)!.async("text");
        zip.file(part, xml.replace("</p:spTree>", `${textBox(77, "덧붙임")}</p:spTree>`));
      }
    });
    expect(await quick(input, masterMode, output)).toEqual([]);
    expect(await checkPptBackground(input, await requestFor(masterMode), output, "full")).toEqual([
      { property: "only-background-cleared", detail: LAYOUT1 },
      { property: "only-background-cleared", detail: SLIDE2 },
    ]);
  });

  it("flags a layout changed in another mode, at full depth only", async () => {
    const input = await syntheticDeck();
    const output = await declareBackground(await apply(input, allSlides), LAYOUT1, solid);
    expect(await quick(input, allSlides, output)).toEqual([]);
    expect(await properties(input, allSlides, output)).toEqual(["non-target-unchanged"]);
  });
});
