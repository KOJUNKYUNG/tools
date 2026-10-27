// Headless Chrome over the DevTools protocol with Node's own WebSocket, so a
// script needs no browser package. Shared by scripts that render or measure
// in a real browser (scripts/gallery/render-shaders.mjs; the same pattern runs
// inline in scripts/measure-ppt-ratios/run-headless.mjs).

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
];

export async function waitFor(check, what, timeoutMs = 30_000) {
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

/**
 * Launch Chrome on `url` and return { evaluate, close }. `evaluate` runs an
 * expression in the page, awaits a returned promise, and returns its value.
 */
export async function openHeadless(url, extraArgs = []) {
  const chromePath = CHROME_CANDIDATES.find((p) => p && existsSync(p));
  if (!chromePath) throw new Error("Chrome not found; set CHROME_PATH");
  const profile = await mkdtemp(join(tmpdir(), "headless-chrome-"));
  const chrome = spawn(
    chromePath,
    ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", ...extraArgs, "about:blank"],
    { stdio: "ignore" },
  );
  const close = async () => {
    chrome.kill();
    await sleep(500); // let Chrome release the profile before removing it
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  };
  try {
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
    await cdp.send("Page.navigate", { url });
    const evaluate = async (expression) => {
      const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      return result.value;
    };
    return {
      evaluate,
      close: async () => {
        cdp.close();
        await close();
      },
    };
  } catch (e) {
    await close();
    throw e;
  }
}
