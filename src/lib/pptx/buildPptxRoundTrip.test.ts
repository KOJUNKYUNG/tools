import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubHeaderCanvas } from "@/lib/image/headerCanvas";
import { sizedImagePreparation, type PrepareStep, type ScreenSize } from "@/lib/image/slideImage";
import { headerOnlyImage } from "@/lib/image/slideImageStandIn";
import { buildPptx } from "./assemblePptx";
import { SLIDE_SIZES } from "./slideSize";

// The background a run puts in the deck is offered as a file to reuse from
// the result card. Uploaded again, with no edits, for a deck of the same
// aspect and screen, it must go in byte for byte: no quality lost on re-use.
// The real preparation runs here, its canvas stood in (`stubHeaderCanvas`).

afterEach(() => vi.unstubAllGlobals());

const file = (bytes: Uint8Array, name: string) => new File([Uint8Array.from(bytes)], name);

/** One slide picture: a small JPEG, which goes in as uploaded. */
const SHEET = file(headerOnlyImage("jpeg", { width: 800, height: 600 }, new Uint8Array([7])), "sheet.jpg");

async function run(picture: Uint8Array, screen: ScreenSize, step?: PrepareStep) {
  return buildPptx(
    {
      files: [SHEET],
      box: { x: 0, y: 0, ...SLIDE_SIZES["16:9"] },
      slideKind: "16:9",
      background: { kind: "image", file: file(picture, "background"), ...(step ? { step } : {}) },
      align: "center",
      screen,
    },
    undefined,
    sizedImagePreparation,
  );
}

/** The deck's background part: pptxgenjs names it after the slide master. */
async function backgroundMedia(deck: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(deck);
  const [name] = Object.keys(zip.files).filter((p) => p.startsWith("ppt/media/ONTAB_BG-"));
  return zip.file(name)!.async("uint8array");
}

/** A step baking effects in: a new picture of the fitted size. */
const filtered: PrepareStep = (fitted) => new OffscreenCanvas(fitted.width, fitted.height);

describe("buildPptx's background picture, re-used", () => {
  const photo = headerOnlyImage("jpeg", { width: 6000, height: 4000 }, new Uint8Array([1]));

  it.each([
    ["a photo, saved as JPEG", "jpeg", "4k", undefined, 3840],
    ["a flat graphic, saved as PNG", "png", "4k", undefined, 3840],
    ["a filtered photo, saved as JPEG", "jpeg", "full-hd", filtered, 1920],
    ["a filtered graphic, saved as PNG", "png", "full-hd", filtered, 1920],
  ] as const)("returns %s, which goes back in byte for byte", async (_, wins, screen, step, width) => {
    stubHeaderCanvas(wins);
    const first = await run(photo, screen, step);

    expect(first.picture).toMatchObject({ format: wins, width });
    expect(await backgroundMedia(first.deck)).toEqual(first.picture!.bytes);

    // Re-measured elsewhere, the format rule would pick the other format.
    stubHeaderCanvas(wins === "png" ? "jpeg" : "png");
    const again = await run(first.picture!.bytes, screen);
    expect(await backgroundMedia(again.deck)).toEqual(first.picture!.bytes);
  });

  it("returns no picture for a colour fill", async () => {
    stubHeaderCanvas("jpeg");
    const result = await buildPptx(
      {
        files: [SHEET],
        box: { x: 0, y: 0, ...SLIDE_SIZES["16:9"] },
        slideKind: "16:9",
        background: { kind: "color", color: "1F2A44" },
        align: "center",
        screen: "4k",
      },
      undefined,
      sizedImagePreparation,
    );
    expect(result.picture).toBeNull();
  });
});
