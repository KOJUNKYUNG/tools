// Test helper: run qpdf in Node.
//
// The app loads qpdf's wasm from the self-hosted URL, which Node can't fetch.
// Point it at the package's own file instead; Emscripten reads it from disk.
import { createRequire } from "node:module";
import { setQpdfWasmLocation } from "./qpdf";

export function initQpdfForNode(): void {
  setQpdfWasmLocation(
    createRequire(import.meta.url).resolve("@neslinesli93/qpdf-wasm/dist/qpdf.wasm"),
  );
}
