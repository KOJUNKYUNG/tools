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
    { label: "fit to image (default)", request: { pages: [image("a")], imageLayout: { mode: "native" } } },
    { label: "fit to image, turned", request: { pages: turned, imageLayout: { mode: "native" } } },
    {
      label: "A4, turned",
      request: { pages: turned, imageLayout: { mode: "fixed", widthPt: 595, heightPt: 842 } },
    },
    {
      label: "custom size",
      request: { pages: [image("a")], imageLayout: { mode: "fixed", widthPt: 1280, heightPt: 720 } },
    },
  ];
}

realFileSuite({
  tool: "image-to-pdf",
  extensions: [".png", ".jpg", ".jpeg"],
  requests,
  run: (input, { pages, imageLayout }) =>
    convertImagesToPdf({ pages, sourceBytesById: sourcesOf(input), imageLayout }),
  check: (input, request, output, depth) =>
    checkImageToPdf(sourcesOf(input), request, output, depth),
});
