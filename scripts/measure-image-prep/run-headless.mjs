// Runs the picture preparation measurement page (index.html) in headless
// Chrome and prints its per-set summary as a Markdown table for the PR;
// --out writes every picture's row as JSON too.
//
// Run: node scripts/measure-image-prep/run-headless.mjs [--sets=jpg,heic,png,pdf-jpg,pdf-png] [--screens=full-hd,4k] [--pdfs=<names>|all] [--pages=6] [--out=results.json]
// Starts serve.mjs unless it already runs on :4340 (MEASURE_IMAGE_PREP_PORT
// overrides the port). CHROME_PATH overrides the Chrome binary. Local only:
// not part of pnpm verify. Drives Chrome with scripts/lib/headlessChrome.mjs,
// so it needs no extra package.

import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openHeadless, waitFor } from "../lib/headlessChrome.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")),
);
const ORIGIN = `http://localhost:${process.env.MEASURE_IMAGE_PREP_PORT ?? 4340}`;
const query = new URLSearchParams(
  Object.entries({ sets: args.sets, screens: args.screens, pdfs: args.pdfs, pages: args.pages }).filter(([, v]) => v),
);
const PAGE = `${ORIGIN}/${query.size ? `?${query}` : ""}`;

async function serverUp() {
  try {
    return (await fetch(ORIGIN + "/")).ok;
  } catch {
    return false;
  }
}

/** Rows as a Markdown table. */
function markdown(rows) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const line = (cells) => `| ${cells.join(" | ")} |`;
  return [line(cols), line(cols.map(() => "---")), ...rows.map((r) => line(cols.map((c) => r[c] ?? "–")))].join("\n");
}

let server = null;
let chrome = null;
try {
  if (!(await serverUp())) {
    server = spawn(process.execPath, [join(here, "serve.mjs")], { stdio: "ignore" });
    await waitFor(serverUp, "serve.mjs");
  }
  chrome = await openHeadless(PAGE);
  let last = "";
  const results = await waitFor(async () => {
    const status = await chrome.evaluate("document.getElementById('status')?.textContent ?? ''");
    if (status !== last) console.error(status);
    last = status;
    return chrome.evaluate("window.__results ?? null");
  }, "the measurement", 60 * 60_000);
  if (results.error) throw new Error(results.error);

  if (args.out) await writeFile(args.out, JSON.stringify(results, null, 2));
  console.log(`PDFs: ${results.pdfs} (first ${results.pages} pages at ${results.dpi} DPI)\n`);
  console.log(markdown(results.summary));
} finally {
  await chrome?.close();
  server?.kill();
}
