// Runs the filter measurement page (index.html) in headless Chrome on the
// machine's real GPU and writes its results as JSON, with the per-filter
// summary as Markdown tables for the PR.
//
// Run: node scripts/measure-filters/run-headless.mjs [--sets=gallery,loose,decks,hires,solids] [--limit=N] [--out=results.json]
// Starts serve.mjs unless it already runs on :4330 (MEASURE_FILTERS_PORT
// overrides the port). CHROME_PATH overrides the Chrome binary. Local only:
// not part of pnpm verify. Keep the machine awake and its screen on for the
// run: with the screen off Chrome stops sending frames, so a Paper filter's
// drawing waits, and its time counts the wait.

import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openHeadless, REAL_GPU_ARGS, waitFor } from "../lib/headlessChrome.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")),
);
const ORIGIN = `http://localhost:${process.env.MEASURE_FILTERS_PORT ?? 4330}`;
const query = new URLSearchParams(Object.entries({ sets: args.sets, limit: args.limit }).filter(([, v]) => v));
const PAGE = `${ORIGIN}/${query.size ? `?${query}` : ""}`;

async function serverUp() {
  try {
    return (await fetch(ORIGIN + "/")).ok;
  } catch {
    return false;
  }
}

/** A summary as a Markdown table. */
function markdown(summary) {
  const cols = Object.keys(summary[0]);
  const line = (cells) => `| ${cells.join(" | ")} |`;
  return [line(cols), line(cols.map(() => "---")), ...summary.map((s) => line(cols.map((c) => s[c] ?? "–")))].join("\n");
}

let server = null;
let chrome = null;
try {
  if (!(await serverUp())) {
    server = spawn(process.execPath, [join(here, "serve.mjs")], { stdio: "ignore" });
    await waitFor(serverUp, "serve.mjs");
  }
  chrome = await openHeadless(PAGE, REAL_GPU_ARGS);
  let last = "";
  const results = await waitFor(async () => {
    const status = await chrome.evaluate("document.getElementById('status')?.textContent ?? ''");
    if (status !== last) console.error(status);
    last = status;
    return chrome.evaluate("window.__results ?? null");
  }, "the measurement", 3 * 60 * 60_000);
  if (results.error) throw new Error(results.error);

  if (args.out) await writeFile(args.out, JSON.stringify(results, null, 2));
  console.log(`Renderer: ${results.renderer}\nPhotos: ${results.photos.length}\n`);
  for (const { title, summary } of results.summaries) console.log(`### ${title}\n\n${markdown(summary)}\n`);
} finally {
  await chrome?.close();
  server?.kill();
}
