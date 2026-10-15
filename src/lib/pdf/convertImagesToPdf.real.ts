// Real-file regression set entry for image-to-pdf (`pnpm test:real`).
// Only PNG and JPEG run here: HEIC is converted to JPEG by the browser's
// canvas before it reaches the engine, which Node cannot do.
import {
  realFileSuite,
  type RealFileRequest,
} from "@/lib/output-check/realFileSuite";
import { convertImagesToPdf } from "./assembleSections";
import { checkImageToPdf, type ImageToPdfRequest } from "./imageToPdfCheck";
import type { PageItem, Rotation } from "./pageItem";

// The suite hands over one file; "a" and "b" let it stand in for two uploads.
const sourcesOf = (input: Uint8Array) =>
  new Map([
    ["a", input],
    ["b", input],
  ]);

function image(sourceFileId: string, rotation: Rotation = 0): PageItem {
  return {
    id: `${sourceFileId}-${rotation}`,
    sourceFileId,
    sourceFileName: `${sourceFileId}.img`,
    kind: "image",
    sourcePageIndex: 0,
    rotation,
    splitAfter: false,
    deleted: false,
  };
}

async function requests(): Promise<RealFileRequest<ImageToPdfRequest>[]> {
  const turned = [image("a", 90), image("b", 270)];
  return [
    { label: "fit to image (default)", request: { pages: [image("a")], layout: { mode: "native" } } },
    { label: "fit to image, turned", request: { pages: turned, layout: { mode: "native" } } },
    {
      label: "A4, turned",
      request: { pages: turned, layout: { mode: "fixed", widthPt: 595, heightPt: 842 } },
    },
    {
      label: "custom size",
      request: { pages: [image("a")], layout: { mode: "fixed", widthPt: 1280, heightPt: 720 } },
    },
  ];
}

realFileSuite({
  tool: "image-to-pdf",
  extensions: [".png", ".jpg", ".jpeg"],
  requests,
  run: (input, { pages, layout }) =>
    convertImagesToPdf({ pages, sourceBytesById: sourcesOf(input), imageLayout: layout }),
  check: (input, request, output, depth) =>
    checkImageToPdf(sourcesOf(input), request, output, depth),
});
