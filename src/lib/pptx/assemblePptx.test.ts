import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import { getImageToPptxLabels } from "@/components/tools/image-to-pptx/labels";
import type { Dictionary } from "@/i18n/config";
import en from "@/i18n/dictionaries/en.json";
import ko from "@/i18n/dictionaries/ko.json";
import { CORRUPT_OUTPUT_PREFIX, getErrorMessage } from "@/lib/errors";
import { headerOnlyImage, standInSizedPreparation } from "@/lib/image/slideImageStandIn";
import { testPng } from "@/lib/image/testPng";
import { readImageHeader } from "@/lib/output-check/imageHeader";
import { openPptxPackage } from "@/lib/output-check/pptxPackage";
import { JPEG_3x2, solidPng, withExifOrientation, withJpegSize } from "@/lib/pdf/testImages";
import {
  assemblePptxFromPlaced,
  buildPptx,
  prepareSlidePicture,
  type BuildPptxInput,
  type PlacedImage,
} from "./assemblePptx";
import * as check from "./imageToPptxCheck";
import { embedAsIs, placedAs } from "./testDownscale";

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
    const backgrounds = mediaEntries(zip).filter((p) => p.startsWith("ppt/media/ONTAB_BG-"));
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

const embedded = async (file: File) => (await embedAsIs(file, 0)).dataUrl;

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
  const deck = await buildPptx(input, undefined, standInSizedPreparation, embedAsIs);
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
    const deck = await buildPptx(input, undefined, standInSizedPreparation, embedAsIs);
    const pictures = await Promise.all(
      files.map((f) => prepareSlidePicture(f, input.slideKind, input.screen, standInSizedPreparation)),
    );
    const opts = { slideKind: input.slideKind, background: WHITE, screen: input.screen };
    expect(await checkImageToPptx(placedAs(pictures.map((p) => p.dataUrl)), opts, deck, "full")).toEqual([]);
  });
});

describe("buildPptx", () => {
  it.each([
    ["a color background", { kind: "color", color: "FFFFFF" } as const],
    ["an image background", { kind: "image", file: pngFile("bg.png", 16, 9) } as const],
  ])("builds a deck on %s that passes the full check", async (_label, background) => {
    const progress: number[] = [];
    const deck = await buildPptx(request(background), (pct) => progress.push(pct), standInSizedPreparation, embedAsIs);

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
          : { kind: "image" as const, dataUrl: await embedded(background.file) },
    };
    const pictures = await Promise.all(
      FILES.map((f) => prepareSlidePicture(f, "16:9", "full-hd", standInSizedPreparation)),
    );
    expect(await checkImageToPptx(placedAs(pictures.map((p) => p.dataUrl)), opts, deck, "full")).toEqual([]);
  });

  it("blocks a failing quick check with the corrupt-output error and image-to-pptx's hint", async () => {
    vi.mocked(check.checkImageToPptx).mockResolvedValueOnce([
      { property: "slide-count", detail: "2 images → 1 slides" },
    ]);
    const err = await buildPptx(
      request({ kind: "color", color: "FFFFFF" }),
      undefined,
      standInSizedPreparation,
      embedAsIs,
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
