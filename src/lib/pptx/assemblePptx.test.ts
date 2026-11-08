import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import { getImageToPptxLabels } from "@/components/tools/image-to-pptx/labels";
import type { Dictionary } from "@/i18n/config";
import en from "@/i18n/dictionaries/en.json";
import ko from "@/i18n/dictionaries/ko.json";
import { CORRUPT_OUTPUT_PREFIX, getErrorMessage, UserFacingError } from "@/lib/errors";
import { resolveBackground } from "@/lib/background/resolveBackground";
import { NO_FILTERS } from "@/lib/image/filterSet";
import type { CropRect } from "@/lib/image/maxFitCrop";
import type { PrepareStep, SizedImagePreparation } from "@/lib/image/slideImage";
import { headerOnlyImage, standInSizedPreparation } from "@/lib/image/slideImageStandIn";
import { testPng } from "@/lib/image/testPng";
import { readImageHeader } from "@/lib/output-check/imageHeader";
import { openPptxPackage } from "@/lib/output-check/pptxPackage";
import { JPEG_3x2, solidPng, withExifOrientation, withJpegSize } from "@/lib/pdf/testImages";
import {
  assemblePptxFromPlaced,
  buildPptx,
  engineBackground,
  prepareBackgroundPicture,
  prepareSlidePicture,
  type BuildPptxInput,
  type PlacedImage,
} from "./assemblePptx";
import * as check from "./imageToPptxCheck";
import { placedAs } from "./testPlaced";

// The real checker by default; one test makes it report a violation.
vi.mock("./imageToPptxCheck", async (importOriginal) => {
  const real = await importOriginal<typeof check>();
  return { ...real, checkImageToPptx: vi.fn(real.checkImageToPptx) };
});
const { checkImageToPptx } = await vi.importActual<typeof check>("./imageToPptxCheck");
const PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
// Three distinct tiny PNGs so each contributes its own media entry (no incidental dedup).
const BG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGNkYGD4z4AEGEkUAACk0gMB/9eeLwAAAABJRU5ErkJggg==";
const C1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8DwnwEJMJIoAACkrwMBhE8mKwAAAABJRU5ErkJggg==";
const C2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGNkYGD4z8DAwMgABYwkCgAAJK8DAdvgQ3UAAAAASUVORK5CYII=";
function placed(n: number): PlacedImage[] {
  return Array.from({ length: n }, () => ({ dataUrl: PX, placement: { x: 1, y: 1, w: 4, h: 3 } }));
}
function mediaEntries(zip: JSZip): string[] {
  return Object.keys(zip.files).filter((p) => /^ppt\/media\/.+/.test(p));
}
/** The background parts: pptxgenjs names them after the slide master. */
function backgroundParts(zip: JSZip): string[] {
  return mediaEntries(zip).filter((p) => p.startsWith("ppt/media/ONTAB_BG-"));
}
describe("assemblePptxFromPlaced", () => {
  it("produces one slide per image", async () => {
    const bytes = await assemblePptxFromPlaced(placed(3), { slideKind: "16:9", screen: "full-hd", background: { kind: "color", color: "FFFFFF" } });
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
    expect(slides.length).toBe(3);
  });
  it("accepts an image background without throwing", async () => {
    const bytes = await assemblePptxFromPlaced(placed(1), { slideKind: "4:3", screen: "full-hd", background: { kind: "image", dataUrl: PX } });
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("stores a shared image background only once across slides", async () => {
    const images: PlacedImage[] = [C1, C2].map((dataUrl) => ({
      dataUrl,
      placement: { x: 1, y: 1, w: 4, h: 3 },
    }));
    const bytes = await assemblePptxFromPlaced(images, {
      slideKind: "16:9",
      screen: "full-hd",
      background: { kind: "image", dataUrl: BG },
    });
    const zip = await JSZip.loadAsync(bytes);
    // Two distinct content images + ONE shared background = 3 media entries.
    // Per-slide backgrounds would duplicate the background to 4.
    expect(mediaEntries(zip).length).toBe(images.length + 1);
  });

  it.each([
    ["JPEG", `data:image/jpeg;base64,${Buffer.from(JPEG_3x2).toString("base64")}`, "jpeg", "image/jpeg"],
    ["PNG", BG, "png", "image/png"],
  ])("names and types a %s background part after its bytes", async (_label, dataUrl, extension, contentType) => {
    const bytes = await assemblePptxFromPlaced(placed(2), { slideKind: "16:9", screen: "full-hd", background: { kind: "image", dataUrl } });
    const zip = await JSZip.loadAsync(bytes);
    const backgrounds = backgroundParts(zip);
    expect(backgrounds).toEqual([`ppt/media/ONTAB_BG-image-1.${extension}`]);
    const types = await zip.file("[Content_Types].xml")!.async("text");
    expect(types).toContain(`<Default Extension="${extension}" ContentType="${contentType}"/>`);
  });

  it("treats a background the canvas did not encode as PNG or JPEG as the tool's failure", async () => {
    // `data:,` is what a canvas that could not allocate returns from toDataURL.
    for (const dataUrl of ["data:,", "data:image/webp;base64,UklGRg=="]) {
      await expect(
        assemblePptxFromPlaced(placed(1), { slideKind: "16:9", screen: "full-hd", background: { kind: "image", dataUrl } }),
      ).rejects.toThrow(CORRUPT_OUTPUT_PREFIX);
    }
  });
});

const pngFile = (name: string, w: number, h: number) =>
  new File([Buffer.from(solidPng(w, h))], name, { type: "image/png" });

const FILES = [pngFile("a.png", 4, 3), pngFile("b.png", 3, 4)];

function request(background: BuildPptxInput["background"]): BuildPptxInput {
  return {
    files: FILES,
    box: { x: 1, y: 1, w: 8, h: 5 },
    slideKind: "16:9",
    background,
    align: "center",
    screen: "full-hd",
  };
}

const WHITE = { kind: "color", color: "FFFFFF" } as const;

const headerFile = (format: "png" | "jpeg", width: number, height: number, tag = 1) =>
  new File(
    [Buffer.from(headerOnlyImage(format, { width, height }, new Uint8Array([tag])))],
    `picture.${format}`,
    { type: `image/${format}` },
  );

/** A deck of one picture, on the stand-in preparation, with what its slide shows. */
async function deckOf(file: File, overrides: Partial<BuildPptxInput> = {}) {
  const input: BuildPptxInput = {
    ...request(WHITE),
    files: [file],
    box: { x: 0, y: 0, w: 13.333, h: 7.5 },
    ...overrides,
  };
  const deck = await buildPptx(input, undefined, standInSizedPreparation);
  const pkg = (await openPptxPackage(deck))!;
  const [part] = await pkg.shownImages(pkg.slideParts[0]);
  const bytes = (await pkg.read(part!))!;
  const xml = await (await JSZip.loadAsync(deck)).file(pkg.slideParts[0])!.async("text");
  const [, offX, offY, extX, extY] =
    /<p:pic>[\s\S]*?<a:off\s+x="(\d+)"\s+y="(\d+)"\s*\/>\s*<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/.exec(xml)!;
  return {
    deck,
    part: part!,
    bytes,
    header: readImageHeader(bytes)!,
    /** Inches on the slide (914400 EMU each). */
    placement: [offX, offY, extX, extY].map((emu) => Number(emu) / 914400),
  };
}

describe("buildPptx's slide pictures", () => {
  it.each([
    ["a portrait phone photo on a 16:9 slide", 3024, 4032, "16:9", 810, 1080],
    ["a 4:3 photo on a 16:9 slide", 4032, 3024, "16:9", 1440, 1080],
    ["a wide picture on a 16:9 slide", 4000, 1000, "16:9", 1920, 480],
    ["a 4:3 photo on a 4:3 slide", 4032, 3024, "4:3", 1440, 1080],
    ["a wide picture on a 4:3 slide", 4000, 1000, "4:3", 1440, 360],
  ] as const)("sizes %s for Full HD", async (_label, w, h, slideKind, width, height) => {
    const { header } = await deckOf(headerFile("jpeg", w, h), { slideKind });
    expect(header).toMatchObject({ width, height });
  });

  it("sizes the same picture for 4K when asked", async () => {
    const { header } = await deckOf(headerFile("jpeg", 3024, 4032), { screen: "4k" });
    expect(header).toMatchObject({ width: 1620, height: 2160 });
  });

  it("never enlarges a picture smaller than the slide", async () => {
    const { header } = await deckOf(headerFile("png", 400, 300));
    expect(header).toMatchObject({ width: 400, height: 300 });
  });

  it("puts a JPEG that fits in as uploaded, byte for byte", async () => {
    const file = headerFile("jpeg", 800, 600);
    const { bytes, part } = await deckOf(file);
    expect(bytes).toEqual(new Uint8Array(await file.arrayBuffer()));
    expect(part).toMatch(/\.jpeg$/);
  });

  it("puts a phone photo that needs turning in upright-sized, not as uploaded", async () => {
    const sideways = withExifOrientation(withJpegSize(JPEG_3x2, 800, 600), 6);
    const { bytes, header } = await deckOf(new File([Buffer.from(sideways)], "phone.jpg", { type: "image/jpeg" }));
    expect(bytes).not.toEqual(sideways);
    expect(header).toMatchObject({ width: 600, height: 800, orientation: 1 });
  });

  it("keeps a picture whose transparency is used as PNG, as uploaded when it fits", async () => {
    const cutout = testPng({ width: 40, height: 30, colorType: 6, pixel: (x) => [0, 0, 0, x < 20 ? 0 : 255] });
    const { bytes, part } = await deckOf(new File([Buffer.from(cutout)], "cutout.png", { type: "image/png" }));
    expect(bytes).toEqual(cutout);
    expect(part).toMatch(/\.png$/);
  });

  it("keeps a large picture whose transparency is used as PNG at its contained size", async () => {
    const cutout = testPng({ width: 2000, height: 100, colorType: 6, pixel: (x) => [0, 0, 0, x < 20 ? 0 : 255] });
    const { header, part } = await deckOf(new File([Buffer.from(cutout)], "cutout.png", { type: "image/png" }));
    expect(header).toMatchObject({ format: "png", width: 1920, height: 96 });
    expect(part).toMatch(/\.png$/);
  });

  it("stores an opaque PNG photo as a JPEG part", async () => {
    const { header, part } = await deckOf(headerFile("png", 3000, 2000));
    expect(header.format).toBe("jpeg");
    expect(part).toMatch(/\.jpeg$/);
  });

  it("places a picture by its upright shape, whatever the screen size", async () => {
    // Stored 4032 × 3024, shown 3024 × 4032: a 3:4 picture in the slide's full height.
    const sideways = withExifOrientation(withJpegSize(JPEG_3x2, 4032, 3024), 6);
    const phone = new File([Buffer.from(sideways)], "phone.jpg", { type: "image/jpeg" });

    const fullHd = await deckOf(phone, { align: "center" });
    const fourK = await deckOf(phone, { align: "center", screen: "4k" });

    const [x, y, w, h] = fullHd.placement;
    expect(h).toBeCloseTo(7.5, 3);
    expect(w).toBeCloseTo(5.625, 3);
    expect(x).toBeCloseTo((13.333 - 5.625) / 2, 3);
    expect(y).toBeCloseTo(0, 3);
    expect(fourK.placement).toEqual(fullHd.placement);
  });

  it("passes the full check, with the deck's screen size", async () => {
    const files = [headerFile("jpeg", 3024, 4032, 1), headerFile("jpeg", 800, 600, 2), headerFile("png", 3000, 2000, 3)];
    const input = { ...request(WHITE), files };
    const deck = await buildPptx(input, undefined, standInSizedPreparation);
    const pictures = await Promise.all(
      files.map((f) => prepareSlidePicture(f, input.slideKind, input.screen, standInSizedPreparation)),
    );
    const opts = { slideKind: input.slideKind, background: WHITE, screen: input.screen };
    expect(await checkImageToPptx(placedAs(pictures.map((p) => p.dataUrl)), opts, deck, "full")).toEqual([]);
  });
});

/** A deck on `background`, on the stand-in preparation, with its stored background picture. */
async function backgroundOf(background: File, overrides: Partial<BuildPptxInput> = {}) {
  const crops: { name: string; crop: CropRect }[] = [];
  const recording: SizedImagePreparation = {
    measure: standInSizedPreparation.measure,
    prepare(source, crop, size, step) {
      crops.push({ name: source instanceof File ? source.name : "", crop });
      return standInSizedPreparation.prepare(source, crop, size, step);
    },
  };
  const input: BuildPptxInput = { ...request({ kind: "image", file: background }), ...overrides };
  const deck = await buildPptx(input, undefined, recording);
  const zip = await JSZip.loadAsync(deck);
  const parts = backgroundParts(zip);
  const bytes = await zip.file(parts[0])!.async("uint8array");
  return {
    deck,
    parts,
    bytes,
    header: readImageHeader(bytes)!,
    media: mediaEntries(zip),
    crop: crops.find((c) => c.name === background.name)?.crop,
  };
}

describe("buildPptx's background picture", () => {
  const named = (file: File, name: string) => new File([file], name, { type: file.type });

  it.each([
    ["a 4:3 photo on a 16:9 slide", 4032, 3024, "16:9", { x: 0, y: 378, width: 4032, height: 2268 }, 1920, 1080],
    ["a portrait photo on a 4:3 slide", 3024, 4032, "4:3", { x: 0, y: 882, width: 3024, height: 2268 }, 1440, 1080],
    ["a 16:9 picture on a 4:3 slide", 3840, 2160, "4:3", { x: 480, y: 0, width: 2880, height: 2160 }, 1440, 1080],
  ] as const)("takes the centred crop of %s, fitted to Full HD", async (_label, w, h, slideKind, crop, width, height) => {
    const result = await backgroundOf(named(headerFile("jpeg", w, h, 9), "bg.jpeg"), { slideKind });
    expect(result.crop).toEqual(crop);
    expect(result.header).toMatchObject({ width, height });
  });

  it("takes the crop the user placed instead of the centred one, fitted to Full HD", async () => {
    const file = named(headerFile("jpeg", 4032, 3024, 9), "bg.jpeg");
    const placed = { x: 1000, y: 100, width: 2560, height: 1440 };
    const result = await backgroundOf(file, { background: { kind: "image", file, crop: placed } });
    expect(result.crop).toEqual(placed);
    expect(result.header).toMatchObject({ width: 1920, height: 1080 });
  });

  it("takes a placed 4:3 crop on a 4:3 slide, fitted to Full HD", async () => {
    const file = named(headerFile("jpeg", 4032, 3024, 9), "bg.jpeg");
    const placed = { x: 200, y: 300, width: 2400, height: 1800 };
    const result = await backgroundOf(file, { slideKind: "4:3", background: { kind: "image", file, crop: placed } });
    expect(result.crop).toEqual(placed);
    expect(result.header).toMatchObject({ width: 1440, height: 1080 });
  });

  it("sizes a placed crop for 4K when the deck asks for it, never enlarging it", async () => {
    const file = named(headerFile("jpeg", 4032, 3024, 9), "bg.jpeg");
    const big = await backgroundOf(file, { screen: "4k", background: { kind: "image", file, crop: { x: 0, y: 0, width: 4000, height: 2250 } } });
    expect(big.header).toMatchObject({ width: 3840, height: 2160 });
    const small = await backgroundOf(file, { screen: "4k", background: { kind: "image", file, crop: { x: 0, y: 0, width: 1600, height: 900 } } });
    expect(small.header).toMatchObject({ width: 1600, height: 900 });
  });

  it("fits the same crop to 4K when asked", async () => {
    const { header } = await backgroundOf(named(headerFile("jpeg", 4032, 3024, 9), "bg.jpeg"), { screen: "4k" });
    expect(header).toMatchObject({ width: 3840, height: 2160 });
  });

  it("puts a background of the slide's aspect that fits in as uploaded, byte for byte", async () => {
    const file = named(headerFile("jpeg", 1600, 900, 9), "bg.jpeg");
    const { bytes, parts } = await backgroundOf(file);
    expect(bytes).toEqual(new Uint8Array(await file.arrayBuffer()));
    expect(parts).toEqual(["ppt/media/ONTAB_BG-image-1.jpeg"]);
  });

  it("crops a phone photo that needs turning by its upright shape, not as uploaded", async () => {
    // Stored 1600 × 900, shown 900 × 1600: the crop is a band across the portrait photo.
    const sideways = withExifOrientation(withJpegSize(JPEG_3x2, 1600, 900), 6);
    const { bytes, header, crop } = await backgroundOf(new File([Buffer.from(sideways)], "bg.jpg", { type: "image/jpeg" }));
    expect(crop).toEqual({ x: 0, y: 547, width: 900, height: 506 });
    expect(bytes).not.toEqual(sideways);
    expect(header).toMatchObject({ width: 900, height: 506, orientation: 1 });
  });

  it("keeps a background whose transparency is used as PNG", async () => {
    const cutout = testPng({ width: 400, height: 300, colorType: 6, pixel: (x) => [0, 0, 0, x < 20 ? 0 : 255] });
    const { header, parts } = await backgroundOf(new File([Buffer.from(cutout)], "bg.png", { type: "image/png" }));
    expect(header).toMatchObject({ format: "png", width: 400, height: 225 });
    expect(parts).toEqual(["ppt/media/ONTAB_BG-image-1.png"]);
  });

  /** A preparation step that records the size of each picture it is handed. */
  function recordingStep() {
    const sizes: { width: number; height: number }[] = [];
    const step: PrepareStep = (fitted) => {
      sizes.push({ width: fitted.width, height: fitted.height });
      return fitted;
    };
    return { step, sizes };
  }

  it.each([
    ["full-hd", 1920, 1080],
    ["4k", 3840, 2160],
  ] as const)("hands the background's step the picture fitted to the deck's %s screen", async (screen, width, height) => {
    const file = named(headerFile("jpeg", 4032, 3024, 9), "bg.jpeg");
    const { step, sizes } = recordingStep();
    const { header } = await backgroundOf(file, { screen, background: { kind: "image", file, step } });
    expect(sizes).toEqual([{ width, height }]);
    expect(header).toMatchObject({ width, height });
  });

  it("encodes a stepped background that would go in as uploaded, rather than putting the upload in", async () => {
    const file = named(headerFile("jpeg", 1600, 900, 9), "bg.jpeg");
    const { step, sizes } = recordingStep();
    const { bytes, header } = await backgroundOf(file, { background: { kind: "image", file, step } });
    expect(sizes).toEqual([{ width: 1600, height: 900 }]);
    expect(bytes).not.toEqual(new Uint8Array(await file.arrayBuffer()));
    expect(header).toMatchObject({ format: "jpeg", width: 1600, height: 900 });
  });

  it("runs the step on the background only, never on the slide pictures", async () => {
    const file = named(headerFile("jpeg", 4032, 3024, 9), "bg.jpeg");
    const { step, sizes } = recordingStep();
    const files = [1, 2, 3].map((tag) => headerFile("jpeg", 800, 600, tag));
    const { media } = await backgroundOf(file, { files, background: { kind: "image", file, step } });
    expect(sizes).toHaveLength(1);
    expect(media).toHaveLength(files.length + 1);
  });

  it("stores the prepared background once, however many slides the engine makes", async () => {
    const files = [1, 2, 3, 4].map((tag) => headerFile("jpeg", 800, 600, tag));
    const { media, parts } = await backgroundOf(named(headerFile("jpeg", 4032, 3024, 9), "bg.jpeg"), { files });
    expect(parts).toHaveLength(1);
    expect(media).toHaveLength(files.length + 1);
  });
});

describe("buildPptx", () => {
  it.each([
    ["a color background", { kind: "color", color: "FFFFFF" } as const],
    ["an image background", { kind: "image", file: pngFile("bg.png", 16, 9) } as const],
    [
      "an image background with a placed crop",
      { kind: "image", file: pngFile("bg.png", 40, 30), crop: { x: 8, y: 4, width: 32, height: 18 } } as const,
    ],
    [
      "an image background with a preparation step",
      { kind: "image", file: pngFile("bg.png", 16, 9), step: (fitted: OffscreenCanvas) => fitted } as const,
    ],
  ])("builds a deck on %s that passes the full check", async (_label, background) => {
    const progress: number[] = [];
    const deck = await buildPptx(request(background), (pct) => progress.push(pct), standInSizedPreparation);

    expect(progress.at(-1)).toBe(100);
    expect(vi.mocked(check.checkImageToPptx)).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      deck,
      "quick",
    );
    const opts = {
      slideKind: "16:9" as const,
      screen: "full-hd" as const,
      background:
        background.kind === "color"
          ? background
          : {
              kind: "image" as const,
              dataUrl: await prepareBackgroundPicture(
                background.file,
                "16:9",
                "full-hd",
                standInSizedPreparation,
                "crop" in background ? background.crop : undefined,
                "step" in background ? background.step : undefined,
              ),
            },
    };
    const pictures = await Promise.all(
      FILES.map((f) => prepareSlidePicture(f, "16:9", "full-hd", standInSizedPreparation)),
    );
    expect(await checkImageToPptx(placedAs(pictures.map((p) => p.dataUrl)), opts, deck, "full")).toEqual([]);
  });

  it("puts a solid colour with grain in as a picture of the colour, through its solid step, and passes the full check", async () => {
    const solid = new File([Buffer.from(headerOnlyImage("png", { width: 3840, height: 2160 }, new Uint8Array([5])))], "solid-336699.png", {
      type: "image/png",
    });
    const solidSizes: number[][] = [];
    const resolved = await resolveBackground(
      { fill: { kind: "colour", rgb: "336699" }, file: null, crop: null, edited: null, filters: { ...NO_FILTERS, grain: 0.2 } },
      {
        drawEdited: () => Promise.reject(new Error("no recipe here")),
        solidPicture: async () => solid,
        step: (kind) =>
          kind === "solid"
            ? (fitted) => {
                solidSizes.push([fitted.width, fitted.height]);
                return fitted;
              }
            : undefined,
      },
    );
    const input = request(engineBackground(resolved));
    const deck = await buildPptx(input, undefined, standInSizedPreparation);

    const zip = await JSZip.loadAsync(deck);
    expect(backgroundParts(zip)).toHaveLength(1);
    expect(solidSizes).toEqual([[1920, 1080]]);
    expect(input.background.kind).toBe("image");
    const background = input.background.kind === "image" ? input.background : null;
    const options = {
      slideKind: "16:9" as const,
      screen: "full-hd" as const,
      background: {
        kind: "image" as const,
        dataUrl: await prepareBackgroundPicture(solid, "16:9", "full-hd", standInSizedPreparation, undefined, background!.step),
      },
    };
    const pictures = await Promise.all(FILES.map((f) => prepareSlidePicture(f, "16:9", "full-hd", standInSizedPreparation)));
    expect(await checkImageToPptx(placedAs(pictures.map((p) => p.dataUrl)), options, deck, "full")).toEqual([]);
  });

  it("keeps a solid colour without picture effects a colour fill", () => {
    expect(engineBackground({ kind: "fill", fill: { kind: "colour", rgb: "808080" } })).toEqual({ kind: "color", color: "808080" });
  });

  it("stops with a failing step's error rather than making a deck without it", async () => {
    const failure = new UserFacingError("the effect could not be drawn");
    const step: PrepareStep = () => Promise.reject(failure);
    const run = buildPptx(request({ kind: "image", file: pngFile("bg.png", 16, 9), step }), undefined, standInSizedPreparation);
    await expect(run).rejects.toBe(failure);
  });

  it("blocks a failing quick check with the corrupt-output error and image-to-pptx's hint", async () => {
    vi.mocked(check.checkImageToPptx).mockResolvedValueOnce([
      { property: "slide-count", detail: "2 images → 1 slides" },
    ]);
    const err = await buildPptx(
      request({ kind: "color", color: "FFFFFF" }),
      undefined,
      standInSizedPreparation,
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    // Narrowed by the assertion above.
    expect((err as Error).message).toMatch(/^CORRUPT_OUTPUT: image-to-pptx: slide-count/);
    // JSON imports are typed by their literal shape; the app reads them as Dictionary.
    for (const dict of [ko, en] as Dictionary[]) {
      const hint = getImageToPptxLabels(dict).errorCorrupt;
      expect(hint).toBeTruthy();
      expect(getErrorMessage(err, { copy: dict.common.errors, corruptOutputHint: hint }).message).toBe(hint);
    }
  });
});
