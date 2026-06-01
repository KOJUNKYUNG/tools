// Copy the qpdf-wasm runtime binary into public/qpdf/ so the app self-hosts it
// (same-origin) instead of fetching from a CDN at runtime. Runs on postinstall,
// mirroring scripts/copy-pdfjs.mjs. Idempotent: clears the target before copying.
//
// Why self-host: @neslinesli93/qpdf-wasm is an Emscripten module that resolves
// its .wasm via locateFile() -> a URL. Serving it from public/qpdf/qpdf.wasm
// keeps the whole tool 0-server and CDN-free (ADR-0001).
import { createRequire } from "node:module";
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const qpdfRoot = dirname(require.resolve("@neslinesli93/qpdf-wasm/package.json"));
const dest = join(process.cwd(), "public", "qpdf");

/** [source-relative-to-qpdf-root, dest-relative-to-public/qpdf] */
const assets = [["dist/qpdf.wasm", "qpdf.wasm"]];

mkdirSync(dest, { recursive: true });

for (const [from, to] of assets) {
  const src = join(qpdfRoot, from);
  const out = join(dest, to);
  if (!existsSync(src)) {
    console.error(`[copy-qpdf] missing source: ${src}`);
    process.exit(1);
  }
  rmSync(out, { recursive: true, force: true });
  cpSync(src, out, { recursive: true });
}

console.log(`[copy-qpdf] qpdf.wasm -> ${dest}`);
