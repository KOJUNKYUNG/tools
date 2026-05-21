// Single source of pdfjs-dist configuration. Assets are self-hosted from
// public/pdfjs/ (copied by scripts/copy-pdfjs.mjs on postinstall) instead of
// fetched from a CDN at runtime — keeps the app fully self-contained.

/** Self-hosted pdfjs asset URLs (same-origin, served from public/pdfjs/). */
export const PDFJS_WORKER_SRC = "/pdfjs/build/pdf.worker.min.mjs";
export const PDFJS_CMAP_URL = "/pdfjs/cmaps/";
export const PDFJS_STANDARD_FONTS_URL = "/pdfjs/standard_fonts/";

/** Common getDocument params for self-hosted CMaps + standard fonts. */
export const pdfjsDocParams = {
  cMapUrl: PDFJS_CMAP_URL,
  cMapPacked: true,
  standardFontDataUrl: PDFJS_STANDARD_FONTS_URL,
} as const;

let cached: typeof import("pdfjs-dist") | null = null;

/** Lazily import pdfjs-dist and point its worker at the self-hosted asset. */
export async function getPdfjsLib(): Promise<typeof import("pdfjs-dist")> {
  if (cached) return cached;
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  cached = pdfjsLib;
  return pdfjsLib;
}
