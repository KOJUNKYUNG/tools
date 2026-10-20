// Copy browser-image-compression's UMD bundle into
// public/browser-image-compression/ so its Web Worker loads the library
// same-origin instead of from cdn.jsdelivr.net at runtime. Runs on
// postinstall, mirroring scripts/copy-pdfjs.mjs. Idempotent: clears the
// target before copying.
//
// Why the UMD build: the worker importScripts() it (classic script, not a
// module), and the bundle defines the global `imageCompression` it calls.
// The app passes this file's URL as `libURL`
// (src/lib/image/imageCompressionWorker.ts).
import { createRequire } from "node:module";
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const libRoot = dirname(require.resolve("browser-image-compression/package.json"));
const dest = join(process.cwd(), "public", "browser-image-compression");

// The source map rides along: the bundle names it, so devtools would 404 without it.
/** [source-relative-to-lib-root, dest-relative-to-public/browser-image-compression] */
const assets = [
  ["dist/browser-image-compression.js", "browser-image-compression.js"],
  ["dist/browser-image-compression.js.map", "browser-image-compression.js.map"],
];

mkdirSync(dest, { recursive: true });

for (const [from, to] of assets) {
  const src = join(libRoot, from);
  const out = join(dest, to);
  if (!existsSync(src)) {
    console.error(`[copy-image-compression] missing source: ${src}`);
    process.exit(1);
  }
  rmSync(out, { recursive: true, force: true });
  cpSync(src, out, { recursive: true });
}

console.log(`[copy-image-compression] browser-image-compression.js (+ map) -> ${dest}`);
