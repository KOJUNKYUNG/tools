// Real-file regression set entry for ppt-background (`pnpm test:real`).
import { resolveObjectURL } from "node:buffer";
import { afterAll, beforeAll, vi } from "vitest";
import { maxFitCrop, type CropRect } from "@/lib/image/maxFitCrop";
import type { SlideSize } from "@/lib/image/slideImage";
import { headerOnlyImage, standInPrepare } from "@/lib/image/slideImageStandIn";
import { testPng } from "@/lib/image/testPng";
import { openPptxPackage } from "@/lib/output-check/pptxPackage";
import {
  realFileSuite,
  type RealFileRequest,
} from "@/lib/output-check/realFileSuite";
import { changeBackground } from "./changeBackground";
import { extractCurrentBackgrounds } from "./extractCurrentBackgrounds";
import { groupBackgrounds } from "./groupBackgrounds";
import { DEFAULT_SLIDE, slideSizeFromXml } from "./getSlideAspect";
import {
  checkPptBackground,
  type PptBackgroundRequest,
} from "./changeBackgroundCheck";

// A phone photo's header (4032 × 3024) stands in for the user's background
// picture; the stand-in preparer sizes it without decoding pixels. The
// processing time the suite prints therefore leaves out decoding and
// re-encoding the picture, which dominate in the browser, and its quick-check
// share overstates the real one: measured in the browser on 2026-10-23 with
// the real preparer, the quick check took 5–8% of applying a background
// (찬양맞추기, canva_template_7, miricanvas_template_1_text), while this suite
// printed ≈ +28%.
const PHOTO_SIZE = { w: 4032, h: 3024 };
const PHOTO = headerOnlyImage(
  "png",
  { width: PHOTO_SIZE.w, height: PHOTO_SIZE.h },
  new TextEncoder().encode("real-file photo"),
);

// A picture whose alpha is used (a cut-out logo): real pixels, so the
// preparer keeps it PNG and the check scans them.
const CUTOUT = testPng({
  width: 400,
  height: 300,
  colorType: 6,
  pixel: (x, y) => [x & 0xff, y & 0xff, 120, (x - 200) ** 2 + (y - 150) ** 2 < 100 ** 2 ? 255 : 0],
});

// The engine measures the background with the browser's Image element; Node
// has none. This stand-in reads the size from the PNG header behind the
// object URL, as a browser would report it.
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

/** The deck's `<p:sldSz>` in EMU, PowerPoint's 16:9 default when absent. */
async function slideSize(input: Uint8Array): Promise<SlideSize> {
  const bytes = await (await openPptxPackage(input))?.read("ppt/presentation.xml");
  return (bytes && slideSizeFromXml(new TextDecoder().decode(bytes))) || DEFAULT_SLIDE;
}

async function requests(
  input: Uint8Array,
): Promise<RealFileRequest<PptBackgroundRequest>[]> {
  const slideCount = (await openPptxPackage(input))?.slideParts.length ?? 1;
  const firstAndLast = [...new Set([1, slideCount])];
  const slide = await slideSize(input);
  const centred = maxFitCrop(PHOTO_SIZE, slide.w, slide.h);
  // The top-left quarter's largest crop: smaller than a 4K screen, so kept as is.
  const corner = { ...maxFitCrop({ w: PHOTO_SIZE.w / 2, h: PHOTO_SIZE.h / 2 }, slide.w, slide.h), x: 0, y: 0 };
  // The deck's first covering-background group, as the preview offers it to keep.
  const covering = groupBackgrounds(
    await extractCurrentBackgrounds(new File([new Uint8Array(input)], "deck.pptx")),
  ).find((g) => g.source === "covering");
  const prepared = async (crop: CropRect, source = PHOTO) => ({
    background: {
      kind: "picture" as const,
      source,
      crop,
      prepared: (await standInPrepare(new Blob([new Uint8Array(source)]), crop, slide)).bytes,
    },
  });
  return [
    {
      label: "all-slides, centred crop (default)",
      request: { ...(await prepared(centred)), mode: "all-slides" },
    },
    { label: "master, centred crop", request: { ...(await prepared(centred)), mode: "master" } },
    {
      label: "all-slides, transparent PNG kept PNG",
      request: {
        ...(await prepared(maxFitCrop({ w: 400, h: 300 }, slide.w, slide.h), CUTOUT)),
        mode: "all-slides",
      },
    },
    {
      label: `specific-slides ${firstAndLast.join(",")}, corner crop`,
      request: {
        ...(await prepared(corner)),
        mode: "specific-slides",
        targetSlides: firstAndLast,
      },
    },
    // Fills carry no picture: the request is what the engine is given.
    { label: "all-slides, solid colour", request: { background: { kind: "colour", rgb: "1F2A44" }, mode: "all-slides" } },
    { label: "master, no background", request: { background: { kind: "none" }, mode: "master" } },
    {
      label: `specific-slides ${firstAndLast.join(",")}, no background`,
      request: { background: { kind: "none" }, mode: "specific-slides", targetSlides: firstAndLast },
    },
    ...(covering
      ? [
          {
            label: `all-slides, keeping the covering group of slides ${covering.slideIndexes.join(",")}`,
            request: { ...(await prepared(centred)), mode: "all-slides" as const, keptCovering: [covering.key] },
          },
        ]
      : []),
  ];
}

realFileSuite({
  tool: "ppt-background",
  extensions: [".pptx"],
  requests,
  run: (input, { background, ...request }, fileName) =>
    changeBackground({
      pptxFile: new File([new Uint8Array(input)], fileName),
      background:
        background.kind === "picture"
          ? {
              kind: "picture",
              file: new File([new Uint8Array(background.source)], "photo.png"),
              crop: background.crop,
            }
          : background,
      mode: request.mode,
      targetSlides: request.targetSlides,
      keptCovering: request.keptCovering,
      prepare: standInPrepare,
    }),
  check: checkPptBackground,
});
