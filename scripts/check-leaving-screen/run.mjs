// What happens when the user leaves the screen during a run (spec #134), in
// real Chrome on the real GPU, through the tool's real page. It runs a tool
// twice on the same file, once visible and once with the window minimized
// mid-run and restored later, and compares what each saved by content. It
// reports the visible run's longest main-thread freeze. With --context-loss it
// forces a WebGL context loss during a ppt-background apply and reports how
// the run ends.
//
// Run: pnpm build, then
//   pnpm check:leaving-screen --tool=pdf-arrange --fixture=<file>
//   pnpm check:leaving-screen --tool=ppt-background --fixture=<deck> --edit=recipe|filter [--context-loss]
//   pnpm check:leaving-screen --compare <fileA> <fileB>
// Options: --hide-after=<ms> how long after the click to minimize (0);
// --hide-for=<s> how long to stay minimized at most (15; past 300 it reaches
// the browser's slowest timers); --timeout=<s> how long a run may take (600);
// --origin=<url> an app already running, instead of `next start` on the last
// build (a dev server's freezes are not the user's); --keep leaves the outputs in
// the temporary folder, to look into a failure.
//
// Fixtures come from tests/fixtures (REAL_FIXTURES_DIR overrides). Outputs go
// to a temporary folder, removed at the end. A Chrome window opens: keep the
// machine awake and its screen on, since with the screen off Chrome sends no
// frames and the "visible" run proves nothing (the check fails it then).
// CHROME_PATH overrides the Chrome binary. Local only: not part of pnpm verify.

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { openChrome, REAL_GPU_ARGS, waitFor } from "../lib/headlessChrome.mjs";
import { compareFiles, compareFolders, startCompareServer } from "./compare.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "../..");

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [key, ...value] = a.slice(2).split("=");
      return [key, value.length ? value.join("=") : true];
    }),
);
const HIDE_AFTER_MS = Number(args["hide-after"] ?? 0);
const HIDE_FOR_MS = Number(args["hide-for"] ?? 15) * 1000;
const TIMEOUT_MS = Number(args.timeout ?? 600) * 1000;
/** After a forced loss, a run still going this long after the screen is back counts as hung. */
const HANG_MS = 90_000;
/** Lets a page's thumbnails finish, so that their work is not counted as the run's. */
const SETTLE_MS = 1500;

/** Gallery item the ppt-background runs pick: a Paper recipe with the edit area. */
const PAPER_ITEM = "/gallery/gradient/mesh-3c-thumb.jpg";

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

function freePort() {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

/** The last production build served, for the freezes a user would see. */
async function startApp() {
  const buildId = join(root, ".next/BUILD_ID");
  if (!existsSync(buildId)) throw new Error("No production build: run pnpm build first, or pass --origin.");
  const port = await freePort();
  const origin = `http://localhost:${port}`;
  const next = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "start", "-p", String(port)], {
    cwd: root,
    stdio: "ignore",
  });
  await waitFor(async () => {
    try {
      return (await fetch(origin)).ok;
    } catch {
      return false;
    }
  }, "next start");
  console.log(`App: next start, build of ${statSync(buildId).mtime.toLocaleString()}`);
  return { origin, close: () => next.kill() };
}

class Browser {
  static async open(blankPage) {
    const browser = new Browser();
    const instrument = await readFile(join(here, "instrument.js"), "utf8");
    browser.chrome = await openChrome(blankPage, {
      headless: false,
      args: [
        ...REAL_GPU_ARGS,
        "--window-size=1400,1000",
        // A window covered by another app counts as hidden on Windows, which
        // would hide the "visible" run; minimizing still hides it.
        "--disable-features=CalculateNativeWinOcclusion",
      ],
      beforeNavigate: async (send) => {
        await send("Page.enable");
        await send("Page.addScriptToEvaluateOnNewDocument", { source: instrument });
      },
    });
    const { windowId } = await browser.chrome.send("Browser.getWindowForTarget");
    browser.windowId = windowId;
    return browser;
  }

  evaluate = (expression) => this.chrome.evaluate(expression);

  /** Runs `expression` as a click does: a save needs a user's gesture. */
  gesture(expression) {
    return this.chrome.send("Runtime.evaluate", { expression, userGesture: true, awaitPromise: true });
  }

  setWindow(windowState) {
    return this.chrome.send("Browser.setWindowBounds", { windowId: this.windowId, bounds: { windowState } });
  }

  navigate = (url) => this.chrome.send("Page.navigate", { url });

  /** The tool's page freshly loaded with `fixture` in its file input, saves going to `downloads`. */
  async openTool(origin, tool, fixture, downloads) {
    await this.chrome.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
    await this.navigate(`${origin}/en/tools/${tool}`);
    const accepts = fixture.toLowerCase().match(/\.[^.]+$/)?.[0];
    const input = `[...document.querySelectorAll('input[type="file"]')].find((i) => i.accept.includes(${JSON.stringify(accepts)}))`;
    // Hydrated, so that the change event reaches the tool.
    await waitFor(
      () =>
        this.evaluate(`(() => {
          const input = ${input};
          return location.pathname.includes(${JSON.stringify(tool)}) && !!input && Object.keys(input).some((k) => k.startsWith("__reactProps"));
        })()`),
      `the ${tool} page's file input`,
    );
    await this.evaluate("__check.marks.uploaded = performance.now()");
    const { result } = await this.chrome.send("Runtime.evaluate", { expression: input });
    await this.chrome.send("DOM.setFileInputFiles", { files: [fixture], objectId: result.objectId });
  }

  /** Waits until the primary button can start a run. */
  waitForReady(what) {
    return waitFor(
      () => this.evaluate(`(() => { const b = document.querySelector("button.btn-primary"); return !!b && !b.disabled; })()`),
      what,
      TIMEOUT_MS,
    );
  }
}

/** A control's value set as typing does, so that React hears it; `value` is an expression of the element. */
function setInput(browser, selector, value) {
  return waitFor(
    () =>
      browser.evaluate(`(() => {
        const el = ${selector};
        if (!el) return false;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${value("el")});
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`),
    selector,
  );
}

/**
 * ppt-background set up as the spec's stretch that needs the screen: a Paper
 * item, edited ("recipe": the hue moved) or filtered ("filter": the first Paper
 * filter), with its preview drawn. Selectors go by structure, not copy, which
 * is still [임시].
 */
async function setUpPaperBackground(browser, edit) {
  const click = (selector) =>
    waitFor(() => browser.evaluate(`(() => { const el = ${selector}; el?.click(); return !!el; })()`), selector);
  await click(`document.querySelector('img[src=${JSON.stringify(PAPER_ITEM)}]')?.closest("button")`);
  await click(`document.querySelector('button[aria-expanded="false"]')`);
  if (edit === "recipe") {
    await setInput(browser, `document.querySelector('[role="tabpanel"] input[type="range"]')`, (slider) => `Number(${slider}.min) + (Number(${slider}.max) - Number(${slider}.min)) / 3`);
  } else {
    const tab = (list, n) => `document.querySelectorAll('[role="tablist"]')[${list}]?.querySelectorAll('[role="tab"]')[${n}]`;
    await click(tab(0, 1)); // The edit area's "effects".
    await click(tab(1, 1)); // The filter set's "style".
    await click(`document.querySelectorAll('[role="group"] button[aria-pressed]')[1]`); // After "none".
  }
  await sleep(SETTLE_MS);
}

async function setUp(browser, origin, options, downloads) {
  await browser.openTool(origin, options.tool, options.fixture, downloads);
  if (options.tool === "ppt-background") await setUpPaperBackground(browser, options.edit);
  // Its text watermark, the default, needs a text.
  if (options.tool === "pdf-watermark") await setInput(browser, `document.querySelector('input[type="text"]')`, () => `"Ontab"`);
  await browser.waitForReady("the tool to take the file");
  await sleep(SETTLE_MS);
}

const hasEnded = (browser) => browser.evaluate("__check.endAt !== null");

/** The primary button clicked; a tool that refuses to start fails here, not at the timeout. */
async function startRun(browser) {
  await browser.gesture("__check.start()");
  await waitFor(() => browser.evaluate(`__check.readRun().state !== "idle"`), "the run to start", 5000);
}

/** Clicks the result's save button if it has one, and waits for what the run saved. */
async function collectSaves(browser, downloads) {
  await browser.gesture(`document.querySelector(".result-pop .btn-download")?.click()`);
  let last = "";
  let stableSince = Date.now();
  await waitFor(
    async () => {
      const names = (await readdir(downloads)).sort().join("\n");
      if (names !== last) stableSince = Date.now();
      last = names;
      const finished = names && !/\.(crdownload|tmp)$/m.test(names);
      return finished && Date.now() - stableSince > 1500;
    },
    "the save",
    TIMEOUT_MS,
  );
}

/** What the page recorded of its run. */
function runReport(browser) {
  return browser.evaluate(`(() => {
    const c = __check;
    const end = c.endAt ?? performance.now();
    const hiddenAt = c.visibility.find((v) => v.hidden);
    const shownAt = hiddenAt && c.visibility.find((v) => !v.hidden && v.at > hiddenAt.at);
    return {
      ms: end - c.startAt,
      ending: c.ending,
      error: c.error,
      framesInRun: c.framesInRun,
      visibilityChanges: c.visibility.length,
      leftBeforeEnd: !!hiddenAt && hiddenAt.at < end,
      finishedWhileHidden: !!hiddenAt && (!shownAt || shownAt.at > end),
      hiddenMs: hiddenAt ? Math.max(0, Math.min(shownAt?.at ?? end, end) - hiddenAt.at) : 0,
      progressAtHide: hiddenAt?.progress ?? null,
      progressAtShow: shownAt?.progress ?? c.progress,
      runFreeze: c.longestFreeze(c.startAt, end),
      loadFreeze: c.longestFreeze(c.marks.uploaded, c.startAt),
      lostEvents: c.lostEvents,
    };
  })()`);
}

async function visibleRun(browser, origin, options, downloads) {
  await setUp(browser, origin, options, downloads);
  await startRun(browser);
  await waitFor(() => hasEnded(browser), "the visible run to end", TIMEOUT_MS);
  const report = await runReport(browser);
  if (report.ending === "done") await collectSaves(browser, downloads);
  return report;
}

async function minimizedRun(browser, origin, options, downloads) {
  await setUp(browser, origin, options, downloads);
  await startRun(browser);
  await sleep(HIDE_AFTER_MS);
  await browser.setWindow("minimized");
  const hiddenSince = Date.now();
  while (Date.now() - hiddenSince < HIDE_FOR_MS && !(await hasEnded(browser))) await sleep(250);
  await browser.setWindow("normal");
  await waitFor(() => hasEnded(browser), "the minimized run to end", TIMEOUT_MS);
  const report = await runReport(browser);
  if (report.ending === "done") await collectSaves(browser, downloads);
  return report;
}

function printRun(name, r) {
  const hidden = r.leftBeforeEnd
    ? ` · hidden ${seconds(r.hiddenMs)}, ${r.finishedWhileHidden ? "finished while hidden" : "finished after return"}` +
      `, progress ${r.progressAtHide ?? "?"}% → ${r.progressAtShow ?? "?"}%, ${r.framesInRun.hidden} frames while hidden`
    : "";
  // A run that left the screen shows only part of its freezes.
  const freeze = r.leftBeforeEnd ? "" : ` · longest freeze ${seconds(r.runFreeze)} (upload to start: ${seconds(r.loadFreeze)})`;
  console.log(`${name}: ${r.ending ?? "no end"} in ${seconds(r.ms)}${hidden}${freeze}`);
  if (r.error) console.log(`  error: ${r.error}`);
}

/** Prints one comparison's line; true when it passes. */
function verdict(pass, line) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${line}`);
  return pass;
}

/** The runs and their outputs compared. True when all pass. */
async function checkLeaving(browser, comparer, origin, options, work) {
  const dirs = { visible: join(work, "visible"), hidden: join(work, "hidden") };
  await mkdir(dirs.visible);
  await mkdir(dirs.hidden);

  const visible = await visibleRun(browser, origin, options, dirs.visible);
  printRun("Visible", visible);
  const hidden = await minimizedRun(browser, origin, options, dirs.hidden);
  printRun("Minimized", hidden);
  console.log();

  const checks = [
    verdict(visible.ending === "done", `the visible run ended in a result`),
    verdict(hidden.ending === "done", `the minimized run ended in a result`),
    // Without these, the comparison says nothing of leaving the screen.
    verdict(
      visible.visibilityChanges === 0 && visible.framesInRun.visible > 0,
      `the visible run stayed on screen (${visible.framesInRun.visible} frames, ${visible.visibilityChanges} visibility changes)`,
    ),
    verdict(
      hidden.leftBeforeEnd,
      `the window was minimized before the run ended (hidden ${seconds(hidden.hiddenMs)}, after ${HIDE_AFTER_MS} ms)`,
    ),
  ];
  if (visible.ending === "done" && hidden.ending === "done") {
    await browser.navigate(comparer.origin);
    const comparisons = await compareFolders(dirs.visible, dirs.hidden, comparer);
    for (const c of comparisons) {
      const diffs = c.diffs.length ? `: ${c.diffs.slice(0, 5).join("; ")}${c.diffs.length > 5 ? `; ${c.diffs.length - 5} more` : ""}` : "";
      checks.push(verdict(c.same, `${c.name} (${c.what})${diffs}`));
    }
    if (comparisons.length === 0) checks.push(verdict(false, "neither run saved a file"));
  }
  return checks.every(Boolean);
}

/**
 * Forces a context loss at each moment and reports how the run ends: an error
 * or the right picture passes; a hang, or a picture that is not the right one,
 * fails.
 */
async function checkContextLoss(browser, comparer, origin, options, work) {
  const reference = join(work, "reference");
  await mkdir(reference);
  const visible = await visibleRun(browser, origin, options, reference);
  printRun("Reference (no loss)", visible);
  if (visible.ending !== "done") return verdict(false, "the reference run ended in a result");
  console.log();

  const scenarios = [
    { name: "on screen, just after the drawing's context is created", moment: "create" },
    { name: "on screen, once the drawing's canvas has its size", moment: "sized" },
    { name: "minimized, while the drawing waits", hidden: true },
  ];
  const checks = [];
  for (const [i, scenario] of scenarios.entries()) {
    const downloads = join(work, `loss-${i}`);
    await mkdir(downloads);
    await setUp(browser, origin, options, downloads);
    const contextsBefore = await browser.evaluate("__check.contexts.length");
    if (scenario.moment) await browser.evaluate(`__check.lossArmedFor = ${JSON.stringify(scenario.moment)}`);
    await startRun(browser);
    let whileHidden = "";
    if (scenario.hidden) {
      await sleep(HIDE_AFTER_MS);
      await browser.setWindow("minimized");
      await waitFor(
        () => browser.evaluate(`__check.endAt !== null || __check.contexts.length > ${contextsBefore}`),
        "the drawing's context",
        HANG_MS,
      ).catch(() => {});
      await browser.evaluate("__check.loseContexts()");
      await sleep(3000);
      const state = await browser.evaluate("__check.readRun().state");
      whileHidden = ` (3 s after the loss, still hidden: ${state})`;
      await browser.setWindow("normal");
    }
    const ended = await waitFor(() => hasEnded(browser), "the run", HANG_MS).catch(() => false);
    const r = await runReport(browser);
    let outcome;
    let pass;
    if (r.lostEvents === 0) {
      outcome = `no loss happened, so this says nothing (${r.ending ?? "no end"})`;
      pass = false;
    } else if (!ended) {
      outcome = `HANG: no end ${seconds(HANG_MS)} after the screen was back, progress ${await browser.evaluate("__check.progress")}%`;
      pass = false;
    } else if (r.ending === "error") {
      outcome = `error after ${seconds(r.ms)}: ${r.error}`;
      pass = true;
    } else {
      await collectSaves(browser, downloads);
      await browser.navigate(comparer.origin);
      const comparisons = await compareFolders(reference, downloads, comparer);
      pass = comparisons.every((c) => c.same);
      outcome = pass
        ? `result after ${seconds(r.ms)}, the same as the reference`
        : `WRONG PICTURE: ${comparisons.flatMap((c) => c.diffs).slice(0, 3).join("; ")}`;
    }
    checks.push(verdict(pass, `${options.edit}, ${scenario.name}${whileHidden}: ${outcome}`));
  }
  return checks.every(Boolean);
}

async function main() {
  const work = await mkdtemp(join(tmpdir(), "leaving-screen-"));
  const comparerServer = await startCompareServer();
  let app = null;
  let browser = null;
  try {
    browser = await Browser.open(`${comparerServer.origin}/`);
    const comparer = { server: comparerServer, evaluate: browser.evaluate, origin: `${comparerServer.origin}/` };

    if (args.compare) {
      const [a, b] = positional;
      if (!a || !b) throw new Error("--compare needs two files");
      await waitFor(() => browser.evaluate("document.readyState === 'complete'"), "the blank page");
      const c = await compareFiles(basename(a), resolve(a), resolve(b), comparer);
      return verdict(c.same, `${basename(a)} against ${basename(b)} (${c.what})${c.diffs.length ? `: ${c.diffs.slice(0, 5).join("; ")}` : ""}`);
    }

    if (!args.tool || !args.fixture) throw new Error("Pass --tool=<slug> and --fixture=<file>");
    const fixture = resolve(process.env.REAL_FIXTURES_DIR ?? join(root, "tests/fixtures"), args.fixture);
    if (!existsSync(fixture)) throw new Error(`No such fixture: ${fixture}`);
    const options = { tool: args.tool, fixture, edit: args.tool === "ppt-background" ? (args.edit ?? "recipe") : null };

    app = args.origin ? { origin: args.origin, close() {} } : await startApp();
    const renderer = await browser.evaluate(`(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "no WebGL2";
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      return name;
    })()`);
    console.log(`Tool: ${options.tool}${options.edit ? ` (${options.edit})` : ""} · Fixture: ${basename(fixture)} · GPU: ${renderer}\n`);

    return args["context-loss"]
      ? await checkContextLoss(browser, comparer, app.origin, options, work)
      : await checkLeaving(browser, comparer, app.origin, options, work);
  } finally {
    await browser?.chrome.close();
    await comparerServer.close();
    app?.close();
    if (args.keep) console.log(`Outputs kept in ${work}`);
    else await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

const passed = await main();
console.log(passed ? "\nPASS" : "\nFAIL");
process.exitCode = passed ? 0 : 1;
