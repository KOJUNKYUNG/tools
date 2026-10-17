// Real-file regression set entry for image-to-pptx (`pnpm test:real`).
// Only PNG and JPEG run here: HEIC is converted to JPEG by the browser's
// canvas before it reaches the engine, which Node cannot do.
import { readImageHeader } from "@/lib/output-check/imageHeader";
import { realFileSuite, type RealFileRequest } from "@/lib/output-check/realFileSuite";
import { solidPng } from "@/lib/pdf/testImages";
import { buildPptx, type AssembleOptions, type BuildPptxInput } from "./assemblePptx";
import { checkImageToPptx } from "./imageToPptxCheck";
import { embedAsIs, placedAs } from "./testDownscale";

/** An uploaded image and the data URL the stand-in embeds for it. */
interface Upload {
  file: File;
  /** Encoded up front, so no timed step pays for it. */
  embedded: string;
}

/** What the user asked for. The real photo is embedded at full size, so the size bound has the most to absorb. */
interface Request {
  slides: Upload[];
  background: Upload | null;
  slideKind: BuildPptxInput["slideKind"];
  align: BuildPptxInput["align"];
}

async function upload(bytes: Uint8Array, name: string): Promise<Upload> {
  const format = readImageHeader(bytes)?.format;
  const type = format === "png" ? "image/png" : "image/jpeg";
  // Copied into a fresh ArrayBuffer: BlobPart wants one, not a shared view.
  const file = new File([bytes.slice()], `${name}.${format === "png" ? "png" : "jpg"}`, { type });
  return { file, embedded: (await embedAsIs(file, 0)).dataUrl };
}

function optionsOf({ background, slideKind }: Request): AssembleOptions {
  return {
    slideKind,
    background: background
      ? { kind: "image", dataUrl: background.embedded }
      : { kind: "color", color: "FFFFFF" },
  };
}

async function requests(input: Uint8Array): Promise<RealFileRequest<Request>[]> {
  // Generated images beside the real one keep every slide's image distinct,
  // so a slide showing another slide's image is caught.
  const [photo, other, backdrop] = await Promise.all([
    upload(input, "photo"),
    upload(solidPng(64, 48), "other"),
    upload(solidPng(160, 90), "backdrop"),
  ]);
  return [
    {
      label: "16:9, white (default)",
      request: { slides: [photo], background: null, slideKind: "16:9", align: "top-left" },
    },
    {
      label: "4:3, image background, 3 slides, centered",
      request: { slides: [other, photo, backdrop], background: backdrop, slideKind: "4:3", align: "center" },
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
        files: request.slides.map((s) => s.file),
        box: { x: 1.33, y: 0.75, w: 10.67, h: 6 },
        slideKind: request.slideKind,
        background: request.background
          ? { kind: "image", file: request.background.file }
          : { kind: "color", color: "FFFFFF" },
        align: request.align,
      },
      undefined,
      embedAsIs,
    ),
  check: (_input, request, output, depth) =>
    checkImageToPptx(placedAs(request.slides.map((s) => s.embedded)), optionsOf(request), output, depth),
});
