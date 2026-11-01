// Runs the ratio measurement page (index.html) in headless Chrome and writes
// its results as JSON, so a measurement needs no browser window.
//
// Run: node scripts/measure-ppt-ratios/run-headless.mjs [--parts=curve,heic,png,fixtures,hires,analysis] [--out=results.json]
// Starts serve.mjs unless it already runs on :4310 (MEASURE_PORT overrides
// the port). CHROME_PATH overrides the Chrome binary. Drives Chrome with
// scripts/lib/headlessChrome.mjs, so it needs no extra package.

import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openHeadless, waitFor } from "../lib/headlessChrome.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")),
);
const ORIGIN = `http://localhost:${process.env.MEASURE_PORT ?? 4310}`;
const PAGE = ORIGIN + "/" + (args.parts ? `?parts=${args.parts}` : "");

async function serverUp() {
  try {
    return (await fetch(ORIGIN + "/")).ok;
  } catch {
    return false;
  }
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
  const json = await waitFor(async () => {
    const statusText = await chrome.evaluate("document.getElementById('status')?.textContent ?? ''");
    if (statusText !== last) console.error(statusText);
    last = statusText;
    return chrome.evaluate("window.__results && JSON.stringify(window.__results)");
  }, "the measurement", 60 * 60_000);

  const results = JSON.parse(json);
  if (results.error) throw new Error(results.error);
  if (args.out) await writeFile(args.out, JSON.stringify(results, null, 2));
  else console.log(JSON.stringify(results, null, 2));
} finally {
  await chrome?.close();
  server?.kill();
}
