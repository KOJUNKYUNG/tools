// Real-file regression set entry for ppt-background (`pnpm test:real`).
import { resolveObjectURL } from "node:buffer";
import { afterAll, beforeAll, vi } from "vitest";
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

// A 2×2 PNG stands in for the user's background image.
const BG_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8DwnwEJMJIoAACkrwMBhE8mKwAAAABJRU5ErkJggg==",
    "base64",
  ),
);

// The engine measures the background with the browser's Image element; Node
// has none. This stand-in reads the size from the PNG header behind the
// object URL, so the engine computes the same cover offsets as in a browser.
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
  return [
    {
      label: "all-slides (default)",
      request: { bgImage: BG_PNG, mode: "all-slides" },
    },
    { label: "master", request: { bgImage: BG_PNG, mode: "master" } },
    {
      label: `specific-slides ${firstAndLast.join(",")}`,
      request: {
        bgImage: BG_PNG,
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
      bgImage: new File([new Uint8Array(request.bgImage)], "bg.png"),
      mode: request.mode,
      targetSlides: request.targetSlides,
    }),
  check: checkPptBackground,
});
