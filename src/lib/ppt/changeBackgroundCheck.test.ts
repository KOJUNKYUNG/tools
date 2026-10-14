import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { changeBackground } from "./changeBackground";
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

/** A 3-slide deck; slide 2 carries its own picture background. */
async function syntheticDeck(): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  for (let i = 1; i <= 3; i++) {
    const slide = pptx.addSlide();
    if (i === 2) slide.background = { data: `image/png;base64,${OLD_BG}` };
    slide.addText(`Slide ${i}`, { x: 1, y: 1, w: 4, h: 1 });
  }
  return (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
}

async function apply(
  deck: Uint8Array,
  request: PptBackgroundRequest,
): Promise<Uint8Array> {
  return changeBackground({
    pptxFile: new File([new Uint8Array(deck)], "deck.pptx"),
    bgImage: new File([new Uint8Array(request.bgImage)], "bg.png"),
    mode: request.mode,
    targetSlides: request.targetSlides,
  });
}

/** Rewrite one output part, keeping everything else byte-for-byte. */
async function mutate(
  bytes: Uint8Array,
  edit: (zip: JSZip) => Promise<void> | void,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  await edit(zip);
  return zip.generateAsync({ type: "uint8array" });
}

async function properties(
  input: Uint8Array,
  request: PptBackgroundRequest,
  output: Uint8Array,
): Promise<string[]> {
  const violations = await checkPptBackground(input, request, output, "full");
  return violations.map((v) => v.property);
}

// The engine measures the background image with the browser's Image element;
// Node has none, so stand in a decoder that reports a fixed size. Everything
// else in the engine runs for real.
beforeAll(() => {
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 1920;
      naturalHeight = 1080;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const allSlides: PptBackgroundRequest = { bgImage: newBgBytes, mode: "all-slides" };

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
        // Drop the declaration that covers the .png background media.
        xml.replace(/<Default[^>]*Extension="png"[^>]*\/>/, ""),
      );
    });
    expect(await properties(input, allSlides, broken)).toContain("content-type");
  });

  it("flags a relationship whose target part is missing", async () => {
    const input = await syntheticDeck();
    const good = await apply(input, allSlides);
    const broken = await mutate(good, async (zip) => {
      const path = "ppt/slides/_rels/slide1.xml.rels";
      const xml = await zip.file(path)!.async("text");
      zip.file(
        path,
        xml.replace(
          "</Relationships>",
          '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/missing.png"/></Relationships>',
        ),
      );
    });
    expect(await properties(input, allSlides, broken)).toContain("relationship-target");
  });

  it("flags a target slide that does not show the new background", async () => {
    const input = await syntheticDeck();
    const good = await apply(input, allSlides);
    const original = await JSZip.loadAsync(input);
    const broken = await mutate(good, async (zip) => {
      // Slide 2 keeps its old background, as if the engine skipped it.
      for (const p of ["ppt/slides/slide2.xml", "ppt/slides/_rels/slide2.xml.rels"]) {
        zip.file(p, await original.file(p)!.async("uint8array"));
      }
    });
    expect(await checkPptBackground(input, allSlides, broken, "quick")).toEqual([
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

  it("flags a slide the user did not target that changed", async () => {
    const request: PptBackgroundRequest = {
      bgImage: newBgBytes,
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
  });

  it("leaves the byte-identity property to the full depth", async () => {
    const request: PptBackgroundRequest = {
      bgImage: newBgBytes,
      mode: "specific-slides",
      targetSlides: [1],
    };
    const input = await syntheticDeck();
    const good = await apply(input, request);
    const changed = await mutate(good, async (zip) => {
      const xml = await zip.file("ppt/slides/slide3.xml")!.async("text");
      zip.file("ppt/slides/slide3.xml", xml.replace("Slide 3", "Slide three"));
    });
    expect(await checkPptBackground(input, request, changed, "quick")).toEqual([]);
  });

  it("flags output that is not a zip at all", async () => {
    const input = await syntheticDeck();
    const garbage = new TextEncoder().encode("not a pptx");
    expect(await properties(input, allSlides, garbage)).toEqual(["zip"]);
  });
});

describe("checkPptBackground passes good output", () => {
  const modes: [string, PptBackgroundRequest][] = [
    ["all slides", allSlides],
    ["the master", { bgImage: newBgBytes, mode: "master" }],
    ["specific slides", { bgImage: newBgBytes, mode: "specific-slides", targetSlides: [1, 3] }],
  ];
  it.each(modes)("reports nothing when applied to %s", async (_, request) => {
    const input = await syntheticDeck();
    const output = await apply(input, request);
    expect(await properties(input, request, output)).toEqual([]);
  });
});

describe("checkPptBackground does not blame the tool for the input", () => {
  it("ignores a defect the input deck already had", async () => {
    // A deck PowerPoint opened despite a dangling relationship: the defect is
    // the user's file, not ppt-background's output.
    const clean = await syntheticDeck();
    const input = await mutate(clean, async (zip) => {
      const path = "ppt/slides/_rels/slide3.xml.rels";
      const xml = await zip.file(path)!.async("text");
      zip.file(
        path,
        xml.replace(
          "</Relationships>",
          '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/gone.png"/></Relationships>',
        ),
      );
    });
    const output = await apply(input, allSlides);
    expect(await properties(input, allSlides, output)).toEqual([]);
  });
});
