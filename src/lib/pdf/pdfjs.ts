// Single source of pdfjs-dist configuration. Assets are self-hosted from
// public/pdfjs/ (copied by scripts/copy-pdfjs.mjs on postinstall) instead of
// fetched from a CDN at runtime — keeps the app fully self-contained.
import type { DocumentInitParameters } from "pdfjs-dist/types/src/display/api";

/** Self-hosted pdfjs asset URLs (same-origin, served from public/pdfjs/). */
export const PDFJS_WORKER_SRC = "/pdfjs/build/pdf.worker.min.mjs";
export const PDFJS_CMAP_URL = "/pdfjs/cmaps/";
export const PDFJS_STANDARD_FONTS_URL = "/pdfjs/standard_fonts/";
export const PDFJS_WASM_URL = "/pdfjs/wasm/";
export const PDFJS_ICC_URL = "/pdfjs/iccs/";

/**
 * Common getDocument params: every asset folder pdfjs can fetch from. The
 * worker fetches each file only when a document needs it: wasm/ holds the
 * JPEG 2000 (JPX), JBIG2/CCITT and ICC colour decoders, iccs/ the CMYK
 * profile. Without wasmUrl, JPX images render blank and ICC colour is off.
 */
export const pdfjsDocParams = {
  cMapUrl: PDFJS_CMAP_URL,
  cMapPacked: true,
  standardFontDataUrl: PDFJS_STANDARD_FONTS_URL,
  wasmUrl: PDFJS_WASM_URL,
  iccUrl: PDFJS_ICC_URL,
} as const satisfies DocumentInitParameters &
  Required<Pick<DocumentInitParameters, "cMapUrl" | "standardFontDataUrl" | "wasmUrl" | "iccUrl">>;

let cached: typeof import("pdfjs-dist") | null = null;

/** Lazily import pdfjs-dist and point its worker at the self-hosted asset. */
export async function getPdfjsLib(): Promise<typeof import("pdfjs-dist")> {
  if (cached) return cached;
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  cached = pdfjsLib;
  return pdfjsLib;
}
