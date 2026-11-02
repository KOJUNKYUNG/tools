// What happens when the user leaves the screen during a run (spec #134), in
// real Chrome on the real GPU, through the tool's real page. It runs a tool
// twice on the same file, once visible and once with the window minimized
// mid-run and restored later, and compares what each saved by content. It
// checks that only a run that truly stops is called paused (the tab's title and
// the was-paused line), and reports the visible run's longest main-thread
// freeze. With --context-loss it forces a WebGL context loss during a
// ppt-background apply and during its preview, on screen and minimized, and
// checks what the user is told, that a retry or the next edit draws again, and
// that the applied picture is the right one.
//
// Run: pnpm build, then
//   pnpm check:leaving-screen --tool=pdf-arrange --fixture=<file>
//   pnpm check:leaving-screen --tool=ppt-background --fixture=<deck> --edit=recipe|filter [--context-loss]
//   pnpm check:leaving-screen --tool=ppt-background --fixture=<deck> --edit=photo|effect
//   pnpm check:leaving-screen --compare <fileA> <fileB>
//   pnpm check:leaving-screen --print-intent [--dpi=150] [--gpu]: pdf-to-image's gate (#139)
// Options: --paused says this file's run truly stops while hidden, where the tool
// alone does not settle it (pdf-to-image: a page print would draw differently);
// --hide-after=<ms> how long after the click to minimize (0);
// --hide-for=<s> how long to stay minimized at most (15; past 300 it reaches
// the browser's slowest timers); --timeout=<s> how long a run may take (600);
// --origin=<url> an app already running, instead of `next start` on the last
// build (a dev server's freezes are not the user's); --keep leaves the outputs in
// their folder, to look into a failure.
//
// Fixtures come from tests/fixtures (REAL_FIXTURES_DIR overrides). Outputs go
// to a folder under tests/ (gitignored), removed at the end. A Chrome window
// opens: keep the machine awake and its screen on, since with the screen off Chrome sends no
// frames and the "visible" run proves nothing (the check fails it then).
// CHROME_PATH overrides the Chrome binary. Local only: not part of pnpm verify.

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { openChrome, REAL_GPU_ARGS, waitFor } from "../lib/headlessChrome.mjs";
import { compareFiles, compareFolders, startCompareServer } from "./compare.mjs";
import { checkPrintIntent } from "./print-intent.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "../..");
const FIXTURES = process.env.REAL_FIXTURES_DIR ?? join(root, "tests/fixtures");

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
/** After a forced loss, a run still going at least this long after the screen is back counts as hung. */
const MIN_HANG_MS = 90_000;
/** Lets a page's thumbnails finish, so that their work is not counted as the run's. */
const SETTLE_MS = 1500;

/** Gallery item the ppt-background runs pick: a Paper recipe with the edit area. */
const PAPER_ITEM = "/gallery/gradient/mesh-3c-thumb.jpg";
/** Gallery photo: applying it draws nothing with Paper. */
const PHOTO_ITEM = "/gallery/nature/balkhash-lake-thumb.jpg";

/** ppt-background's setups (--edit), and whether a run of each draws with Paper, so truly stops while hidden. */
const DRAWS_WITH_PAPER = { recipe: true, filter: true, photo: false, effect: false };

/** The copy of the page openTool opens: the checks follow it while it is [임시]. */
const { processingStatus: RUN_COPY, errors: ERROR_COPY } = JSON.parse(await readFile(join(root, "src/i18n/dictionaries/en.json"), "utf8")).common;

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

async function openBrowser(blankPage) {
  const instrument = await readFile(join(here, "instrument.js"), "utf8");
  const chrome = await openChrome(blankPage, {
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
  const { windowId } = await chrome.send("Browser.getWindowForTarget");
  const evaluate = chrome.evaluate;
  return {
    evaluate,
    close: chrome.close,
    /** Runs `expression` as a click does: a save needs a user's gesture. */
    gesture: (expression) => chrome.send("Runtime.evaluate", { expression, userGesture: true, awaitPromise: true }),
    setWindow: (windowState) => chrome.send("Browser.setWindowBounds", { windowId, bounds: { windowState } }),
    navigate: (url) => chrome.send("Page.navigate", { url }),

    /** The tool's page freshly loaded with `fixture` in its file input, saves going to `downloads`. */
    async openTool({ origin, tool, fixture }, downloads) {
      await chrome.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
      await chrome.send("Page.navigate", { url: `${origin}/en/tools/${tool}` });
      const extension = fixture.toLowerCase().match(/\.[^.]+$/)?.[0];
      const input = `[...document.querySelectorAll('input[type="file"]')].find((i) => i.accept.includes(${JSON.stringify(extension)}))`;
      // Hydrated, so that the change event reaches the tool.
      await waitFor(
        () =>
          evaluate(`(() => {
            const input = ${input};
            return location.pathname.includes(${JSON.stringify(tool)}) && !!input && Object.keys(input).some((k) => k.startsWith("__reactProps"));
          })()`),
        `the ${tool} page's file input`,
      );
      await evaluate("__check.uploadedAt = performance.now()");
      const { result } = await chrome.send("Runtime.evaluate", { expression: input });
      await chrome.send("DOM.setFileInputFiles", { files: [fixture], objectId: result.objectId });
    },
  };
}

/** A third of the way along the slider `el`. */
const SLIDER_MOVED = "Number(el.min) + (Number(el.max) - Number(el.min)) / 3";

/** A control's value set as typing does, so that React hears it. */
function setInput(browser, selector, valueExpression) {
  return waitFor(
    () =>
      browser.evaluate(`(() => {
        const el = ${selector};
        if (!el) return false;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${valueExpression});
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`),
    selector,
  );
}

/**
 * ppt-background set up as the spec's stretch that needs the screen: a Paper
 * item, edited ("recipe": the hue moved) or filtered ("filter": the first Paper
 * filter), with its preview drawn. Or as a run with no such stretch: a photo
 * ("photo"), or the Paper item's file with a 2D effect ("effect": blur).
 * Selectors go by structure, not copy, which is still [임시].
 */
async function setUpBackground(browser, { edit }) {
  const click = (selector) =>
    waitFor(() => browser.evaluate(`(() => { const el = ${selector}; el?.click(); return !!el; })()`), selector);
  const item = edit === "photo" ? PHOTO_ITEM : PAPER_ITEM;
  await click(`document.querySelector('img[src=${JSON.stringify(item)}]')?.closest("button")`);
  if (edit === "photo") return sleep(SETTLE_MS);
  await click(`document.querySelector('button[aria-expanded="false"]')`);
  if (edit === "recipe") {
    await setInput(browser, `document.querySelector('[role="tabpanel"] input[type="range"]')`, SLIDER_MOVED);
  } else {
    const tab = (list, n) => `document.querySelectorAll('[role="tablist"]')[${list}]?.querySelectorAll('[role="tab"]')[${n}]`;
    await click(tab(0, 1)); // The edit area's "effects".
    if (edit === "effect") {
      // The filter set's "adjust" tab opens first; its first slider is blur.
      await setInput(browser, `document.querySelector('[role="tabpanel"] [role="tabpanel"] input[type="range"]')`, SLIDER_MOVED);
    } else {
      await click(tab(1, 1)); // The filter set's "style".
      await click(`document.querySelectorAll('[role="group"] button[aria-pressed]')[1]`); // After "none".
    }
  }
  await sleep(SETTLE_MS);
}

/** What a tool needs beyond its file before a run can start. */
const TOOL_SET_UP = {
  "ppt-background": setUpBackground,
  // Its text watermark, the default, needs a text.
  "pdf-watermark": (browser) => setInput(browser, `document.querySelector('input[type="text"]')`, `"Ontab"`),
};

async function setUp(browser, options, downloads) {
  await browser.openTool(options, downloads);
  await TOOL_SET_UP[options.tool]?.(browser, options);
  await waitFor(
    () => browser.evaluate(`(() => { const b = document.querySelector("button.btn-primary"); return !!b && !b.disabled; })()`),
    "the tool to take the file",
    TIMEOUT_MS,
  );
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

/** The ended run's report, and what it saved. */
async function finishRun(browser, downloads) {
  const report = await browser.evaluate("__check.report()");
  if (report.ending === "done") await collectSaves(browser, downloads);
  return report;
}

async function visibleRun(browser, options, downloads) {
  await setUp(browser, options, downloads);
  await startRun(browser);
  await waitFor(() => hasEnded(browser), "the visible run to end", TIMEOUT_MS);
  return finishRun(browser, downloads);
}

async function minimizedRun(browser, options, downloads) {
  await setUp(browser, options, downloads);
  await startRun(browser);
  await sleep(HIDE_AFTER_MS);
  await browser.setWindow("minimized");
  const hiddenSince = Date.now();
  while (Date.now() - hiddenSince < HIDE_FOR_MS && !(await hasEnded(browser))) await sleep(250);
  await browser.setWindow("normal");
  await waitFor(() => hasEnded(browser), "the minimized run to end", TIMEOUT_MS);
  return finishRun(browser, downloads);
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

const listDiffs = (diffs) => (diffs.length ? `: ${diffs.slice(0, 5).join("; ")}${diffs.length > 5 ? `; ${diffs.length - 5} more` : ""}` : "");

/** Two runs' saved files, read in the blank page. */
async function compareRuns(browser, reader, dirA, dirB) {
  await browser.navigate(reader.page);
  await waitFor(() => browser.evaluate(`location.href === ${JSON.stringify(reader.page)} && document.readyState === "complete"`), "the blank page");
  return compareFolders(dirA, dirB, reader);
}

/** What the two runs said of a pause: only a run that truly stops is called paused, and only while it applies. */
function checkPausedSigns(visible, hidden, stops) {
  const paused = (r) => r.titles.filter((t) => t.title === RUN_COPY.pausedTitle);
  const said = (r) => r.lines.includes(RUN_COPY.wasPaused);
  const calledPaused = (r) => paused(r).length > 0 || said(r);
  const seen = (r) => `titles ${JSON.stringify(r.titles.map((t) => t.title))}, last line ${JSON.stringify(r.lines.at(-1) ?? null)}`;
  const checks = [
    verdict(!calledPaused(visible), `the visible run was not called paused`),
    verdict(
      visible.titleAtEnd === visible.titleAtStart && hidden.titleAtEnd === hidden.titleAtStart,
      `the tab's title is back after each run (${JSON.stringify(hidden.titleAtEnd)})`,
    ),
  ];
  if (stops) {
    const afterPaused = hidden.titles[hidden.titles.findLastIndex((t) => t.title === RUN_COPY.pausedTitle) + 1];
    checks.push(
      verdict(paused(hidden).length > 0 && paused(hidden).every((t) => t.hidden), `the title said paused while hidden (${seen(hidden)})`),
      verdict(
        afterPaused?.title === hidden.titleAtStart && !afterPaused.hidden && afterPaused.state === "processing",
        `the title came back on return, with the run still going (${JSON.stringify(afterPaused ?? null)})`,
      ),
      // Nothing follows it: once shown, it stayed.
      verdict(hidden.lines.indexOf(RUN_COPY.wasPaused) === hidden.lines.length - 1 && said(hidden), `the was-paused line stayed until the run ended (${seen(hidden)})`),
    );
  } else {
    checks.push(verdict(!calledPaused(hidden), `the minimized run was not called paused (${seen(hidden)})`));
  }
  return checks;
}

/** The runs and their outputs compared. True when all pass. */
async function checkLeaving(browser, reader, options, work) {
  const dirs = { visible: join(work, "visible"), hidden: join(work, "hidden") };
  await mkdir(dirs.visible);
  await mkdir(dirs.hidden);

  const visible = await visibleRun(browser, options, dirs.visible);
  printRun("Visible", visible);
  const hidden = await minimizedRun(browser, options, dirs.hidden);
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
  // An edit that did not register would apply the gallery's file, with no drawing to wait for.
  if (DRAWS_WITH_PAPER[options.edit]) {
    checks.push(
      verdict(
        visible.drawingContexts > 0 && hidden.drawingContexts > 0,
        `both runs drew with Paper (${visible.drawingContexts} and ${hidden.drawingContexts} new WebGL contexts)`,
      ),
    );
  }
  checks.push(...checkPausedSigns(visible, hidden, DRAWS_WITH_PAPER[options.edit] ?? options.paused));
  if (visible.ending === "done" && hidden.ending === "done") {
    const comparisons = await compareRuns(browser, reader, dirs.visible, dirs.hidden);
    for (const c of comparisons) checks.push(verdict(c.same, `${c.name} (${c.what})${listDiffs(c.diffs)}`));
    if (comparisons.length === 0) checks.push(verdict(false, "neither run saved a file"));
  }
  return checks.every(Boolean);
}

/** What differs between the saved result of the run in `downloads` and the reference; nothing when it is the same picture. */
async function wrongPicture(browser, reader, reference, downloads) {
  await collectSaves(browser, downloads);
  const comparisons = await compareRuns(browser, reader, reference, downloads);
  return comparisons.every((c) => c.same) ? "" : `WRONG PICTURE${listDiffs(comparisons.flatMap((c) => c.diffs))}`;
}

const primaryReady = (browser) =>
  browser.evaluate(`(() => { const b = document.querySelector("button.btn-primary"); return !!b && !b.disabled; })()`);

/**
 * Forces a context loss during an apply, at each moment, and judges how the
 * run ends: in an error that says what the user should hear, with a retry that
 * gives the right picture. A hang fails, and so does a picture that is not the
 * right one, or another message.
 */
async function checkApplyLoss(browser, reader, options, work, reference, hangMs) {
  const existing = options.edit === "recipe" ? ERROR_COPY.recipeDrawFailed : ERROR_COPY.filterDrawFailed;
  const scenarios = [
    { name: "on screen, as the drawing's context is created", moment: "at-once", message: existing },
    { name: "on screen, just after the drawing's context is created", moment: "create", message: existing },
    { name: "on screen, once the drawing's canvas has its size", moment: "sized", message: existing },
    { name: "minimized, as the drawing's context is created", moment: "at-once", hiddenFromStart: true, message: ERROR_COPY.drawingInterrupted },
    { name: "minimized, while the drawing waits", hiddenMidRun: true, message: ERROR_COPY.drawingInterrupted },
  ];
  const checks = [];
  for (const [i, scenario] of scenarios.entries()) {
    const downloads = join(work, `apply-loss-${i}`);
    await mkdir(downloads);
    await setUp(browser, options, downloads);
    const contextsBefore = await browser.evaluate("__check.contexts.length");
    if (scenario.hiddenFromStart) await browser.setWindow("minimized");
    if (scenario.moment) await browser.evaluate(`__check.lossArmedFor = ${JSON.stringify(scenario.moment)}`);
    await startRun(browser);
    let whileHidden = "";
    if (scenario.hiddenFromStart) {
      await sleep(3000);
      await browser.setWindow("normal");
    }
    if (scenario.hiddenMidRun) {
      await sleep(HIDE_AFTER_MS);
      await browser.setWindow("minimized");
      // No drawing context by then is judged below: the loss would miss the drawing.
      await waitFor(
        () => browser.evaluate(`__check.endAt !== null || __check.contexts.length > ${contextsBefore}`),
        "the drawing's context",
        hangMs,
      ).catch(() => {});
      await browser.evaluate("__check.loseContexts()");
      await sleep(3000);
      const state = await browser.evaluate("__check.readRun().state");
      whileHidden = ` (3 s after the loss, still hidden: ${state})`;
      await browser.setWindow("normal");
    }
    const ended = await waitFor(() => hasEnded(browser), "the run", hangMs).catch(() => false);
    const r = await browser.evaluate("__check.report()");
    const line = `${options.edit}, ${scenario.name}${whileHidden}`;
    if (r.drawingContextsLost === 0) {
      checks.push(verdict(false, `${line}: the drawing lost no context (${r.drawingContexts} new contexts), so this says nothing (${r.ending ?? "no end"})`));
    } else if (!ended) {
      checks.push(verdict(false, `${line}: HANG: no end ${seconds(hangMs)} after the screen was back, progress ${await browser.evaluate("__check.progress")}%`));
    } else if (r.ending === "done") {
      // The drawing outlived its loss, so there is nothing to tell the user.
      const wrong = await wrongPicture(browser, reader, reference, downloads);
      checks.push(verdict(!wrong, `${line}: ${wrong || `result after ${seconds(r.ms)}, the same as the reference`}`));
    } else {
      checks.push(
        verdict(r.error === scenario.message, `${line}: error after ${seconds(r.ms)}: ${r.error}`),
        verdict(r.titleAtEnd === r.titleAtStart, `${line}: the tab's title is back (${JSON.stringify(r.titleAtEnd)})`),
      );
      // The input and the settings kept, one click tries again.
      if (await browser.evaluate("__check.retry()")) {
        await waitFor(() => primaryReady(browser), "the tool to be ready again", 5000);
        await startRun(browser);
        await waitFor(() => hasEnded(browser), "the retried run", hangMs);
        const again = await browser.evaluate("__check.report()");
        const wrong = again.ending === "done" ? await wrongPicture(browser, reader, reference, downloads) : `ended in ${again.ending}: ${again.error}`;
        checks.push(verdict(!wrong, `${line}: ${wrong || "the retry gave the same picture as the reference"}`));
      } else {
        checks.push(verdict(false, `${line}: no retry button`));
      }
    }
  }
  return checks;
}

/** A toast with `message`, waited for; false when none came. */
const toastSaid = (browser, message) =>
  waitFor(() => browser.evaluate(`__check.toasts().some((t) => t.includes(${JSON.stringify(message)}))`), "the toast", 10_000).catch(() => false);

/**
 * A recipe edit's preview losing its live context: it says so and draws again
 * on the next edit. The edit ends where it started, so the apply should give
 * the reference's picture.
 */
async function loseRecipePreview(browser, hidden) {
  if (hidden) await browser.setWindow("minimized");
  await browser.evaluate("__check.loseContexts()");
  await sleep(2000);
  if (hidden) await browser.setWindow("normal");
  const slider = `document.querySelector('[role="tabpanel"] input[type="range"]')`;
  const rightWords = await toastSaid(browser, hidden ? ERROR_COPY.drawingInterrupted : ERROR_COPY.recipeDrawFailed);
  await setInput(browser, slider, "Number(el.min) + ((Number(el.max) - Number(el.min)) * 2) / 3");
  const drew = await waitFor(() => browser.evaluate("__check.liveDrawings() > 0"), "the preview to draw again", 10_000).catch(() => false);
  await setInput(browser, slider, SLIDER_MOVED);
  return { rightWords, drew };
}

/**
 * A filter's preview losing its context while it draws (its context lives only
 * that long). On screen the full-size drawing is lost: the preview says so, and
 * the next edit, even one that does not change the filter's drawing, draws
 * again. Minimized, a change draws only a draft, replaced before the screen is
 * back: losing it costs nothing, so nothing is said and the full size draws on
 * return. The edits end where they started, so the apply should give the
 * reference's picture.
 */
async function loseFilterPreview(browser, hidden) {
  const filters = `document.querySelectorAll('[role="group"] button[aria-pressed]')`;
  const strength = `document.querySelector('[role="tabpanel"] [role="tabpanel"] input[type="range"]')`;
  // A drawing that succeeded, by the timing it records.
  const drawings = `performance.getEntriesByName("ontab:paper-filter").length`;
  const drewSince = (count) =>
    waitFor(() => browser.evaluate(`${drawings} > ${count}`), "the preview to draw again", 10_000).catch(() => false);
  const original = await browser.evaluate(`${strength}.value`);
  let rightWords;
  let drew;
  if (hidden) {
    const before = await browser.evaluate(drawings);
    await browser.setWindow("minimized");
    await browser.evaluate(`__check.lossArmedFor = "create"; ${filters}[2].click()`);
    await sleep(2000);
    await browser.setWindow("normal");
    drew = await drewSince(before);
    await sleep(SETTLE_MS);
    rightWords = (await browser.evaluate("__check.toasts().length")) === 0;
  } else {
    await browser.evaluate(`__check.lossArmedFor = "second"; ${filters}[2].click()`);
    rightWords = await toastSaid(browser, ERROR_COPY.filterDrawFailed);
    await sleep(SETTLE_MS);
    const before = await browser.evaluate(drawings);
    await setInput(browser, strength, SLIDER_MOVED);
    drew = await drewSince(before);
  }
  await browser.evaluate(`${filters}[1].click()`);
  await setInput(browser, strength, JSON.stringify(original));
  return { rightWords, drew };
}

/** A context lost during a preview, on screen and minimized. */
async function checkPreviewLoss(browser, reader, options, work, reference, hangMs) {
  const lose = options.edit === "recipe" ? loseRecipePreview : loseFilterPreview;
  const checks = [];
  for (const hidden of [false, true]) {
    const downloads = join(work, `preview-loss-${hidden ? "hidden" : "visible"}`);
    await mkdir(downloads);
    await setUp(browser, options, downloads);
    const line = `${options.edit}, preview, ${hidden ? "minimized" : "on screen"}`;
    const { rightWords, drew } = await lose(browser, hidden);
    await sleep(SETTLE_MS);
    checks.push(verdict(rightWords, `${line}: the user was told what applies, or nothing where nothing failed`), verdict(drew, `${line}: the preview drew again`));
    await startRun(browser);
    const ended = await waitFor(() => hasEnded(browser), "the run", hangMs).catch(() => false);
    const r = await browser.evaluate("__check.report()");
    const wrong = !ended ? "HANG" : r.ending === "done" ? await wrongPicture(browser, reader, reference, downloads) : `ended in ${r.ending}: ${r.error}`;
    checks.push(verdict(!wrong, `${line}: ${wrong || "applying gave the same picture as the reference"}`));
  }
  return checks;
}

/** Forces context losses and judges what follows. True when all pass. */
async function checkContextLoss(browser, reader, options, work) {
  const reference = join(work, "reference");
  await mkdir(reference);
  const visible = await visibleRun(browser, options, reference);
  printRun("Reference (no loss)", visible);
  if (visible.ending !== "done") return verdict(false, "the reference run ended in a result");
  console.log();
  // A slow deck is not a hung one.
  const hangMs = Math.max(MIN_HANG_MS, visible.ms * 5);
  const checks = [
    ...(await checkApplyLoss(browser, reader, options, work, reference, hangMs)),
    ...(await checkPreviewLoss(browser, reader, options, work, reference, hangMs)),
  ];
  return checks.every(Boolean);
}

/** The options a tool run takes, from the command line. */
function toolOptions(origin) {
  const fixture = resolve(FIXTURES, args.fixture);
  if (!existsSync(fixture)) throw new Error(`No such fixture: ${fixture}`);
  const edit = args.tool === "ppt-background" ? (args.edit ?? "recipe") : null;
  if (edit && !(edit in DRAWS_WITH_PAPER)) throw new Error(`--edit takes ${Object.keys(DRAWS_WITH_PAPER).join(", ")}`);
  if (args["context-loss"] && !DRAWS_WITH_PAPER[edit]) throw new Error("--context-loss needs a drawing: --edit=recipe or filter");
  return { origin, tool: args.tool, fixture, edit, paused: Boolean(args.paused) };
}

async function main() {
  await mkdir(join(root, "tests"), { recursive: true });
  // Outputs of real files stay under tests/ (gitignored), as the files themselves do.
  const work = await mkdtemp(join(root, "tests/leaving-screen-"));
  const server = await startCompareServer();
  const page = `${server.origin}/`;
  let app = null;
  let browser = null;
  try {
    browser = await openBrowser(page);
    const reader = { server, evaluate: browser.evaluate, page };

    if (args.compare) {
      const [a, b] = positional;
      if (!a || !b) throw new Error("--compare needs two files");
      await waitFor(() => browser.evaluate("document.readyState === 'complete'"), "the blank page");
      const c = await compareFiles(basename(a), resolve(a), resolve(b), reader);
      return verdict(c.same, `${basename(a)} against ${basename(b)} (${c.what})${listDiffs(c.diffs)}`);
    }

    if (args["print-intent"]) {
      await waitFor(() => browser.evaluate("document.readyState === 'complete'"), "the blank page");
      return await checkPrintIntent(reader, [FIXTURES, join(root, "tests/print-intent-samples")], { dpi: Number(args.dpi ?? 150), gpu: args.gpu });
    }

    if (!args.tool || !args.fixture) throw new Error("Pass --tool=<slug> and --fixture=<file>");
    const renderer = await browser.evaluate(`(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "no WebGL2";
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      return name;
    })()`);
    if (/swiftshader|llvmpipe|software|no WebGL2/i.test(renderer)) throw new Error(`Not the real GPU: ${renderer}`);

    app = args.origin ? { origin: args.origin, close() {} } : await startApp();
    const options = toolOptions(app.origin);
    console.log(`Tool: ${options.tool}${options.edit ? ` (${options.edit})` : ""} · Fixture: ${basename(options.fixture)} · GPU: ${renderer}\n`);

    return args["context-loss"]
      ? await checkContextLoss(browser, reader, options, work)
      : await checkLeaving(browser, reader, options, work);
  } finally {
    await browser?.close();
    await server.close();
    app?.close();
    if (args.keep) console.log(`Outputs kept in ${work}`);
    else await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

const passed = await main();
console.log(passed ? "\nPASS" : "\nFAIL");
process.exitCode = passed ? 0 : 1;
