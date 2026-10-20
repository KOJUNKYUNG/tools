// Real-file regression set entry for ppt-background (`pnpm test:real`).
import { resolveObjectURL } from "node:buffer";
import { afterAll, beforeAll, vi } from "vitest";
import { maxFitCrop, type CropRect } from "@/lib/image/maxFitCrop";
import { headerOnlyImage, standInPrepare } from "@/lib/image/slideImageStandIn";
import { openPptxPackage } from "@/lib/output-check/pptxPackage";
import {
  realFileSuite,
  type RealFileRequest,
} from "@/lib/output-check/realFileSuite";
import { changeBackground } from "./changeBackground";
import {
  checkPptBackground,
  type PptBackgroundRequest,
} from "./changeBackgroundCheck";
import { getSlideAspect } from "./getSlideAspect";

// A phone photo's header (4032 × 3024) stands in for the user's background
// picture; the stand-in preparer sizes it without decoding pixels.
const PHOTO_SIZE = { w: 4032, h: 3024 };
const PHOTO = headerOnlyImage(
  "png",
  { width: PHOTO_SIZE.w, height: PHOTO_SIZE.h },
  new TextEncoder().encode("real-file photo"),
);

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

async function requests(
  input: Uint8Array,
): Promise<RealFileRequest<PptBackgroundRequest>[]> {
  const slideCount = (await openPptxPackage(input))?.slideParts.length ?? 1;
  const firstAndLast = [...new Set([1, slideCount])];
  // Only the slide's shape matters to the preparer.
  const slide = { w: (await getSlideAspect(new File([new Uint8Array(input)], "deck.pptx"))).ratio, h: 1 };
  const centred = maxFitCrop(PHOTO_SIZE, slide.w, slide.h);
  // The top-left quarter's largest crop: smaller than a 4K screen, so kept as is.
  const corner = { ...maxFitCrop({ w: PHOTO_SIZE.w / 2, h: PHOTO_SIZE.h / 2 }, slide.w, slide.h), x: 0, y: 0 };
  const prepared = async (crop: CropRect) => ({
    source: PHOTO,
    crop,
    background: (await standInPrepare(new Blob([new Uint8Array(PHOTO)]), crop, slide)).bytes,
  });
  return [
    {
      label: "all-slides, centred crop (default)",
      request: { ...(await prepared(centred)), mode: "all-slides" },
    },
    { label: "master, centred crop", request: { ...(await prepared(centred)), mode: "master" } },
    {
      label: `specific-slides ${firstAndLast.join(",")}, corner crop`,
      request: {
        ...(await prepared(corner)),
        mode: "specific-slides",
        targetSlides: firstAndLast,
      },
    },
  ];
}

realFileSuite({
  tool: "ppt-background",
  extensions: [".pptx"],
  requests,
  run: (input, request, fileName) =>
    changeBackground({
      pptxFile: new File([new Uint8Array(input)], fileName),
      bgImage: new File([new Uint8Array(request.source)], "photo.png"),
      mode: request.mode,
      targetSlides: request.targetSlides,
      crop: request.crop,
      prepare: standInPrepare,
    }),
  check: checkPptBackground,
});
