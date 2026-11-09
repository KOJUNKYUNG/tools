// Real-file regression set entry for image-to-pptx (`pnpm test:real`).
// Only PNG and JPEG run here: HEIC is converted to JPEG by the browser's
// canvas before it reaches the engine, which Node cannot do.
import type { ScreenSize } from "@/lib/image/slideImage";
import { standInSizedPreparation } from "@/lib/image/slideImageStandIn";
import { readImageHeader } from "@/lib/output-check/imageHeader";
import { realFileSuite, type RealFileRequest } from "@/lib/output-check/realFileSuite";
import { solidPng } from "@/lib/pdf/testImages";
import {
  buildPptx,
  placeSlidePicture,
  prepareBackgroundPicture,
  type AssembleOptions,
  type BuildPptxInput,
  type PlacedImage,
} from "./assemblePptx";
import { checkImageToPptx } from "./imageToPptxCheck";
import type { Box } from "./slidePlacement";
import { SLIDE_SIZES } from "./slideSize";

/** What the user asked for, and what the stand-in preparation embeds for it. */
interface Request {
  slides: File[];
  /** Placed and encoded up front, so no timed step pays for it. */
  slidesPlaced: PlacedImage[];
  background: { file: File; embedded: string } | null;
  box: Box;
  slideKind: BuildPptxInput["slideKind"];
  align: BuildPptxInput["align"];
  screen: ScreenSize;
}

/** The box the tool's earlier tests used: inside a 16:9 or 4:3 slide. */
const INSIDE: Box = { x: 1.33, y: 0.75, w: 6, h: 6 };

function upload(bytes: Uint8Array, name: string): File {
  const format = readImageHeader(bytes)?.format;
  const type = format === "png" ? "image/png" : "image/jpeg";
  // Copied into a fresh ArrayBuffer: BlobPart wants one, not a shared view.
  return new File([bytes.slice()], `${name}.${format === "png" ? "png" : "jpg"}`, { type });
}

function optionsOf({ background, slideKind, screen }: Request): AssembleOptions {
  return {
    slideKind,
    screen,
    background: background
      ? { kind: "image", dataUrl: background.embedded }
      : { kind: "color", color: "FFFFFF" },
  };
}

async function requests(input: Uint8Array): Promise<RealFileRequest<Request>[]> {
  // Generated images beside the real one keep every slide's image distinct,
  // so a slide showing another slide's image is caught.
  const photo = upload(input, "photo");
  const other = upload(solidPng(64, 48), "other");
  const backdrop = upload(solidPng(160, 90), "backdrop");

  const requested = async (
    slides: File[],
    background: File | null,
    slideKind: Request["slideKind"],
    align: Request["align"],
    screen: ScreenSize,
    box: Box = INSIDE,
  ): Promise<Request> => ({
    slides,
    slidesPlaced: await Promise.all(
      slides.map((file) => placeSlidePicture(file, box, align, slideKind, screen, standInSizedPreparation)),
    ),
    background: background && {
      file: background,
      embedded: await prepareBackgroundPicture(background, slideKind, screen, standInSizedPreparation),
    },
    box,
    slideKind,
    align,
    screen,
  });

  // The photo at 200% of the slide, centred: cut on every side whatever its shape.
  const SLIDE = SLIDE_SIZES["16:9"];
  const enlarged: Box = { x: -SLIDE.w / 2, y: -SLIDE.h / 2, w: SLIDE.w * 2, h: SLIDE.h * 2 };

  return [
    {
      label: "16:9, white, Full HD (default)",
      request: await requested([photo], null, "16:9", "top-left", "full-hd"),
    },
    {
      label: "16:9, white, 4K",
      request: await requested([photo], null, "16:9", "top-left", "4k"),
    },
    {
      label: "4:3, image background, 3 slides, centered",
      request: await requested([other, photo, backdrop], backdrop, "4:3", "center", "full-hd"),
    },
    {
      // A JPEG photo as background must be stored as a JPEG part (#74).
      label: "16:9, the photo as background",
      request: await requested([other], photo, "16:9", "center", "full-hd"),
    },
    {
      // Most real photos are not 4:3, so this takes the centred crop.
      label: "4:3, the photo as background, 4K",
      request: await requested([other], photo, "4:3", "center", "4k"),
    },
    {
      // Placed past the slide: only the part on it enters the deck (#159).
      label: "16:9, the photo enlarged past the slide, Full HD",
      request: await requested([photo, other], null, "16:9", "center", "full-hd", enlarged),
    },
    {
      label: "16:9, the photo enlarged past the slide, 4K",
      request: await requested([photo], backdrop, "16:9", "center", "4k", enlarged),
    },
  ];
}

realFileSuite({
  tool: "image-to-pptx",
  extensions: [".png", ".jpg", ".jpeg"],
  requests,
  run: (_input, request) =>
    buildPptx(
      {
        files: request.slides,
        box: request.box,
        slideKind: request.slideKind,
        background: request.background
          ? { kind: "image", file: request.background.file }
          : { kind: "color", color: "FFFFFF" },
        align: request.align,
        screen: request.screen,
      },
      undefined,
      standInSizedPreparation,
    ),
  check: (_input, request, output, depth) =>
    checkImageToPptx(request.slidesPlaced, optionsOf(request), output, depth),
});
