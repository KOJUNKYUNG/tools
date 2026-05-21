// Copy pdfjs-dist runtime assets into public/pdfjs/ so the app self-hosts them
// instead of fetching from unpkg at runtime. Runs on postinstall (covers dev,
// build, and CI). Idempotent: clears each target before copying.
//
// Assets copied (all required for correct rendering):
//   - build/pdf.worker.min.mjs : the render worker
//   - cmaps/                    : character maps (CJK / Korean text rendering)
//   - standard_fonts/           : fallback fonts for PDFs without embedded fonts
import { createRequire } from "node:module";
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const dest = join(process.cwd(), "public", "pdfjs");

/** [source-relative-to-pdfjs-root, dest-relative-to-public/pdfjs] */
const assets = [
  ["build/pdf.worker.min.mjs", "build/pdf.worker.min.mjs"],
  ["cmaps", "cmaps"],
  ["standard_fonts", "standard_fonts"],
];

mkdirSync(dest, { recursive: true });

for (const [from, to] of assets) {
  const src = join(pdfjsRoot, from);
  const out = join(dest, to);
  if (!existsSync(src)) {
    console.error(`[copy-pdfjs] missing source: ${src}`);
    process.exit(1);
  }
  rmSync(out, { recursive: true, force: true });
  cpSync(src, out, { recursive: true });
}

console.log(`[copy-pdfjs] worker + cmaps + standard_fonts -> ${dest}`);
