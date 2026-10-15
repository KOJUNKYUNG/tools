// Node adapter for the PDF inspector: pdfjs's legacy build, which runs in
// Node with an in-process worker. Test-only; the app uses the browser adapter.
import { createRequire } from "node:module";
import path from "node:path";
import type { PdfjsAdapter } from "./pdfInspector";

const fontsDir = path.join(
  path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json")),
  "standard_fonts",
);

export const nodePdfjsAdapter: PdfjsAdapter = {
  async load() {
    // The legacy build declares the same API as the main entry.
    const lib = (await import(
      "pdfjs-dist/legacy/build/pdf.mjs"
    )) as typeof import("pdfjs-dist");
    // pdfjs reads standard fonts from a path in Node and requires a trailing
    // "/" (it rejects Windows' "\"), which Node's fs accepts on every OS.
    return { lib, docParams: { standardFontDataUrl: `${fontsDir}/` } };
  },
};
