// Runs the ratio measurement page (index.html) in headless Chrome and writes
// its results as JSON, so a measurement needs no browser window.
//
// Run: node scripts/measure-ppt-ratios/run-headless.mjs [--parts=curve,heic,fixtures] [--out=results.json]
// Starts serve.mjs unless it already runs on :4310. CHROME_PATH overrides the
// Chrome binary. Drives Chrome over the DevTools protocol with Node's own
// WebSocket, so it needs no extra package.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const here = fileURLToPath(new URL(".", import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")),
);
const PAGE = "http://localhost:4310/" + (args.parts ? `?parts=${args.parts}` : "");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
];

async function serverUp() {
  try {
    return (await fetch("http://localhost:4310/")).ok;
  } catch {
    return false;
  }
}

async function waitFor(check, what, timeoutMs = 30_000) {
  for (const start = Date.now(); Date.now() - start < timeoutMs; await sleep(250)) {
    const value = await check();
    if (value) return value;
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** A minimal DevTools protocol client: send(method, params) → result. */
function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    const handler = pending.get(msg.id);
    if (!handler) return;
    pending.delete(msg.id);
    if (msg.error) handler.reject(new Error(msg.error.message));
    else handler.resolve(msg.result);
  });
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  return opened.then(() => ({
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        pending.set(++id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      }),
    close: () => ws.close(),
  }));
}

const children = [];
const profile = await mkdtemp(join(tmpdir(), "measure-ppt-ratios-"));
try {
  if (!(await serverUp())) {
    children.push(spawn(process.execPath, [join(here, "serve.mjs")], { stdio: "ignore" }));
    await waitFor(serverUp, "serve.mjs");
  }
  const chromePath = CHROME_CANDIDATES.find((p) => p && existsSync(p));
  if (!chromePath) throw new Error("Chrome not found; set CHROME_PATH");
  children.push(
    spawn(chromePath, [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "about:blank",
    ], { stdio: "ignore" }),
  );
  const port = await waitFor(async () => {
    try {
      return (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0];
    } catch {
      return null;
    }
  }, "Chrome's DevTools port");
  // The page target can appear a moment after the port file.
  const page = await waitFor(async () => {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    return targets.find((t) => t.type === "page");
  }, "Chrome's page target");
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.send("Page.navigate", { url: PAGE });

  const evaluate = async (expression) =>
    (await cdp.send("Runtime.evaluate", { expression, returnByValue: true })).result.value;
  let last = "";
  const json = await waitFor(async () => {
    const statusText = await evaluate("document.getElementById('status')?.textContent ?? ''");
    if (statusText !== last) console.error(statusText);
    last = statusText;
    return evaluate("window.__results && JSON.stringify(window.__results)");
  }, "the measurement", 60 * 60_000);
  cdp.close();

  const results = JSON.parse(json);
  if (results.error) throw new Error(results.error);
  if (args.out) await writeFile(args.out, JSON.stringify(results, null, 2));
  else console.log(JSON.stringify(results, null, 2));
} finally {
  for (const child of children) child.kill();
  await sleep(500); // let Chrome release the profile before removing it
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
