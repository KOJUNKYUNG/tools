// Real-file regression set entry for image-to-pdf (`pnpm test:real`).
// Only PNG and JPEG run here: HEIC is converted to JPEG by the browser's
// canvas before it reaches the engine, which Node cannot do.
import {
  realFileSuite,
  type RealFileRequest,
} from "@/lib/output-check/realFileSuite";
import { convertImagesToPdf } from "./assembleSections";
import { checkImageToPdf, type ImageToPdfRequest } from "./imageToPdfCheck";
import { imagePage as image } from "./testImages";

// The suite hands over one file; "a" and "b" let it stand in for two uploads.
const sourcesOf = (input: Uint8Array) =>
  new Map([
    ["a", input],
    ["b", input],
  ]);

async function requests(): Promise<RealFileRequest<ImageToPdfRequest>[]> {
  const turned = [image("a", 90), image("b", 270)];
  return [
    { label: "A4 (default)", request: { pages: [image("a")], pageSize: { kind: "preset", preset: "a4" } } },
    { label: "B4, turned", request: { pages: turned, pageSize: { kind: "preset", preset: "b4" } } },
    { label: "16:9, turned", request: { pages: turned, pageSize: { kind: "preset", preset: "16:9" } } },
    {
      label: "custom 300 × 200 mm",
      request: { pages: [image("a")], pageSize: { kind: "custom", widthMm: 300, heightMm: 200 } },
    },
    {
      label: "A4, auto, 10 mm margin",
      request: { pages: turned, pageSize: { kind: "preset", preset: "a4" }, marginMm: 10 },
    },
    {
      label: "A4, portrait, 20 mm margin",
      request: { pages: turned, pageSize: { kind: "preset", preset: "a4" }, orientation: "portrait", marginMm: 20 },
    },
    {
      label: "16:9, landscape, 10 mm margin",
      request: { pages: turned, pageSize: { kind: "preset", preset: "16:9" }, orientation: "landscape", marginMm: 10 },
    },
    { label: "image fit", request: { pages: [image("a")], pageSize: { kind: "image-fit" } } },
    { label: "image fit, turned", request: { pages: turned, pageSize: { kind: "image-fit" } } },
  ];
}

realFileSuite({
  tool: "image-to-pdf",
  extensions: [".png", ".jpg", ".jpeg"],
  requests,
  run: (input, request) => convertImagesToPdf({ ...request, sourceBytesById: sourcesOf(input) }),
  check: (input, request, output, depth) =>
    checkImageToPdf(sourcesOf(input), request, output, depth),
});
