// Real-file regression set entry for image-to-pptx (`pnpm test:real`).
// Only PNG and JPEG run here: HEIC is converted to JPEG by the browser's
// canvas before it reaches the engine, which Node cannot do.
import { readImageHeader } from "@/lib/output-check/imageHeader";
import { realFileSuite, type RealFileRequest } from "@/lib/output-check/realFileSuite";
import {
  buildPptx,
  type AssembleOptions,
  type BuildPptxInput,
  type DownscaleForSlide,
  type PlacedImage,
} from "./assemblePptx";
import { checkImageToPptx } from "./imageToPptxCheck";

/**
 * Node has no canvas, so the file's bytes stand in for the downscaled image:
 * the engine's placement, assembly and output check run on the real photo,
 * at its full size (the size bound then has the most to absorb).
 */
const asIs: DownscaleForSlide = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = readImageHeader(bytes);
  if (!header) throw new Error(`cannot read the image header of ${file.name}`);
  const quarterTurned = header.orientation >= 5;
  return {
    dataUrl: `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`,
    w: quarterTurned ? header.height : header.width,
    h: quarterTurned ? header.width : header.height,
  };
};

/** What the user asked for, minus the files (the suite hands over one). */
interface Request {
  /** The input as the stand-in embeds it, encoded up front so no timed step pays for it. */
  embedded: string;
  slides: number;
  slideKind: BuildPptxInput["slideKind"];
  imageBackground: boolean;
  align: BuildPptxInput["align"];
}

function fileOf(input: Uint8Array): File {
  const format = readImageHeader(input)?.format;
  // Copied into a fresh ArrayBuffer: BlobPart wants one, not a shared view.
  return new File([input.slice()], `input.${format === "png" ? "png" : "jpg"}`, {
    type: format === "png" ? "image/png" : "image/jpeg",
  });
}

function buildInput(input: Uint8Array, r: Request): BuildPptxInput {
  const file = fileOf(input);
  return {
    files: Array.from({ length: r.slides }, () => file),
    box: { x: 1.33, y: 0.75, w: 10.67, h: 6 },
    slideKind: r.slideKind,
    background: r.imageBackground ? { kind: "image", file } : { kind: "color", color: "FFFFFF" },
    align: r.align,
  };
}

/** The checker's view of the run: the images as embedded (placement is not checked). */
function placedOf({ embedded, slides }: Request): PlacedImage[] {
  return Array.from({ length: slides }, () => ({
    dataUrl: embedded,
    placement: { x: 0, y: 0, w: 0, h: 0 },
  }));
}

function optionsOf({ embedded, slideKind, imageBackground }: Request): AssembleOptions {
  return {
    slideKind,
    background: imageBackground
      ? { kind: "image", dataUrl: embedded }
      : { kind: "color", color: "FFFFFF" },
  };
}

async function requests(input: Uint8Array): Promise<RealFileRequest<Request>[]> {
  const { dataUrl: embedded } = await asIs(fileOf(input), 0);
  return [
    {
      label: "16:9, white (default)",
      request: { embedded, slides: 1, slideKind: "16:9", imageBackground: false, align: "top-left" },
    },
    {
      label: "4:3, image background, 3 slides, centered",
      request: { embedded, slides: 3, slideKind: "4:3", imageBackground: true, align: "center" },
    },
  ];
}

realFileSuite({
  tool: "image-to-pptx",
  extensions: [".png", ".jpg", ".jpeg"],
  requests,
  run: (input, request) => buildPptx(buildInput(input, request), undefined, asIs),
  check: (_input, request, output, depth) =>
    checkImageToPptx(placedOf(request), optionsOf(request), output, depth),
});
