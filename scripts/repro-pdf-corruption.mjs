// One-off repro script for the pdf-compress corruption bug.
// Compresses every PDF in tests/fixtures across all three presets and
// reports corruption signatures.
//
// Run:  node scripts/repro-pdf-corruption.mjs
//
// Corruption signatures we look for:
//   - Output does not start with %PDF
//   - Output is < 5% of original (24KB-from-3MB pattern)
//   - analyze() on output reports 0 pages (or fewer than the source)

import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  default as initWasm,
  analyze,
  compress_advanced,
} from "@kihyun1998/justpdf-compress-wasm";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = resolve(__dirname, "../tests/fixtures");
const WASM_PATH = resolve(
  __dirname,
  "../node_modules/@kihyun1998/justpdf-compress-wasm/justpdf_compress_wasm_bg.wasm",
);

// Mirrors src/lib/pdf/compressPdf.ts:ADVANCED_PARAMS exactly.
const PRESETS = {
  low: { jpegQuality: 0, maxDpi: 0, stripMetadata: false },
  medium: { jpegQuality: 75, maxDpi: 0, stripMetadata: false },
  high: { jpegQuality: 65, maxDpi: 150, stripMetadata: true },
};

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function main() {
  const wasmBytes = await readFile(WASM_PATH);
  await initWasm({ module_or_path: wasmBytes });

  const files = (await readdir(FIXTURES)).filter((n) =>
    n.toLowerCase().endsWith(".pdf"),
  );
  if (files.length === 0) {
    console.log("No PDFs found in", FIXTURES);
    return;
  }

  for (const name of files) {
    const path = join(FIXTURES, name);
    const bytes = new Uint8Array(await readFile(path));
    console.log(`\n=== ${name} (${fmtBytes(bytes.length)}) ===`);

    // Source analysis
    try {
      const src = analyze(bytes);
      console.log(
        `  source: pages=${src.pages} images=${src.images} imageBytes=${fmtBytes(src.total_image_bytes)} encrypted=${src.is_encrypted}`,
      );
      src.free();
    } catch (e) {
      console.log("  source analyze FAILED:", e?.message ?? e);
    }

    for (const [preset, p] of Object.entries(PRESETS)) {
      const t0 = Date.now();
      let out;
      try {
        const r = compress_advanced(
          bytes,
          p.jpegQuality,
          p.maxDpi,
          /* font_subsetting */ false,
          /* remove_unused_resources */ true,
          /* strip_metadata */ p.stripMetadata,
          /* strip_extras */ false,
          /* grayscale */ false,
        );
        out = {
          data: r.data(),
          originalSize: r.original_size,
          compressedSize: r.compressed_size,
        };
        r.free();
      } catch (e) {
        console.log(`  [${preset}] THREW:`, e?.message ?? e);
        continue;
      }
      const dt = Date.now() - t0;
      const ratio = out.compressedSize / out.originalSize;
      const startsWithPdf =
        out.data[0] === 0x25 &&
        out.data[1] === 0x50 &&
        out.data[2] === 0x44 &&
        out.data[3] === 0x46;
      let pagesAfter = "?";
      try {
        const a = analyze(out.data);
        pagesAfter = String(a.pages);
        a.free();
      } catch (e) {
        pagesAfter = `ERR(${e?.message ?? e})`;
      }
      const flags = [];
      if (!startsWithPdf) flags.push("NO_%PDF_HEADER");
      if (ratio < 0.05) flags.push(`TINY(${(ratio * 100).toFixed(2)}%)`);
      if (pagesAfter === "0") flags.push("PAGES=0");
      const tag = flags.length ? `⚠ ${flags.join(" ")}` : "ok";
      console.log(
        `  [${preset}] ${fmtBytes(out.compressedSize)} (${(ratio * 100).toFixed(1)}%) pages=${pagesAfter} ${dt}ms — ${tag}`,
      );
    }
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
