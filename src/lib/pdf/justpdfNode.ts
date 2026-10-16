// Test helper: initialise justpdf in Node.
//
// justpdf is browser-targeted: its default init() fetches the wasm by URL,
// which Node can't do. Initialise it once with the wasm bytes; the engine's
// own init() then finds the module ready. A failure here must fail the suite.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import initJustpdf from "@kihyun1998/justpdf-compress-wasm";

let ready: Promise<unknown> | null = null;

export function initJustpdfForNode(): Promise<unknown> {
  ready ??= (async () => {
    const wasmPath = createRequire(import.meta.url).resolve(
      "@kihyun1998/justpdf-compress-wasm/justpdf_compress_wasm_bg.wasm",
    );
    return initJustpdf({ module_or_path: await readFile(wasmPath) });
  })();
  return ready;
}
