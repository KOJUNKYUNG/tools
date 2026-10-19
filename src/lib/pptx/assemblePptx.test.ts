import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import { getImageToPptxLabels } from "@/components/tools/image-to-pptx/labels";
import type { Dictionary } from "@/i18n/config";
import en from "@/i18n/dictionaries/en.json";
import ko from "@/i18n/dictionaries/ko.json";
import { CORRUPT_OUTPUT_PREFIX, getErrorMessage } from "@/lib/errors";
import { JPEG_3x2, solidPng } from "@/lib/pdf/testImages";
import {
  assemblePptxFromPlaced,
  buildPptx,
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
    const bytes = await assemblePptxFromPlaced(placed(3), { slideKind: "16:9", background: { kind: "color", color: "FFFFFF" } });
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
    expect(slides.length).toBe(3);
  });
  it("accepts an image background without throwing", async () => {
    const bytes = await assemblePptxFromPlaced(placed(1), { slideKind: "4:3", background: { kind: "image", dataUrl: PX } });
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("stores a shared image background only once across slides", async () => {
    const images: PlacedImage[] = [C1, C2].map((dataUrl) => ({
      dataUrl,
      placement: { x: 1, y: 1, w: 4, h: 3 },
    }));
    const bytes = await assemblePptxFromPlaced(images, {
      slideKind: "16:9",
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
    const bytes = await assemblePptxFromPlaced(placed(2), { slideKind: "16:9", background: { kind: "image", dataUrl } });
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
        assemblePptxFromPlaced(placed(1), { slideKind: "16:9", background: { kind: "image", dataUrl } }),
      ).rejects.toThrow(CORRUPT_OUTPUT_PREFIX);
    }
  });
});

const pngFile = (name: string, w: number, h: number) =>
  new File([Buffer.from(solidPng(w, h))], name, { type: "image/png" });

const FILES = [pngFile("a.png", 4, 3), pngFile("b.png", 3, 4)];

function request(background: BuildPptxInput["background"]): BuildPptxInput {
  return { files: FILES, box: { x: 1, y: 1, w: 8, h: 5 }, slideKind: "16:9", background, align: "center" };
}

const embedded = async (file: File) => (await embedAsIs(file, 0)).dataUrl;

describe("buildPptx", () => {
  it.each([
    ["a color background", { kind: "color", color: "FFFFFF" } as const],
    ["an image background", { kind: "image", file: pngFile("bg.png", 16, 9) } as const],
  ])("builds a deck on %s that passes the full check", async (_label, background) => {
    const progress: number[] = [];
    const deck = await buildPptx(request(background), (pct) => progress.push(pct), embedAsIs);

    expect(progress.at(-1)).toBe(100);
    expect(vi.mocked(check.checkImageToPptx)).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      deck,
      "quick",
    );
    const opts = {
      slideKind: "16:9" as const,
      background:
        background.kind === "color"
          ? background
          : { kind: "image" as const, dataUrl: await embedded(background.file) },
    };
    const placed = placedAs(await Promise.all(FILES.map(embedded)));
    expect(await checkImageToPptx(placed, opts, deck, "full")).toEqual([]);
  });

  it("blocks a failing quick check with the corrupt-output error and image-to-pptx's hint", async () => {
    vi.mocked(check.checkImageToPptx).mockResolvedValueOnce([
      { property: "slide-count", detail: "2 images → 1 slides" },
    ]);
    const err = await buildPptx(
      request({ kind: "color", color: "FFFFFF" }),
      undefined,
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
