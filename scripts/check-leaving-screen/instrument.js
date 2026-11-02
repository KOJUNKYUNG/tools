// Runs in the tool page from its first line (Page.addScriptToEvaluateOnNewDocument):
// what the check reads back. It changes nothing the tool sees, apart from
// enabling WEBGL_lose_context on each WebGL context, so that a loss can be forced.
(() => {
  if (window.top !== window) return;

  const check = {
    startAt: null,
    endAt: null,
    ending: null,
    error: null,
    freezes: [],
    visibility: [],
    framesInRun: { visible: 0, hidden: 0 },
    progress: null,
    contexts: [],
    lossArmedFor: null,
    uploadedAt: null,
    titleAtStart: null,
    /** Each title the tab had during the run, and the tab and the run as it came. */
    titles: [],
    /** Each line shown under the progress during the run. */
    lines: [],
  };
  window.__check = check;

  // A frame comes about every 16 ms on screen, so a gap between frames is a
  // freeze the user sees. A hidden page has no frames, and no freeze to see.
  let lastFrame = null;

  document.addEventListener("visibilitychange", () => {
    lastFrame = null;
    check.visibility.push({ hidden: document.hidden, at: performance.now(), progress: check.progress });
  });

  const countFrame = (now) => {
    if (lastFrame !== null && now - lastFrame > 50) check.freezes.push({ start: lastFrame, duration: now - lastFrame });
    lastFrame = now;
    if (check.startAt !== null && check.endAt === null) check.framesInRun[document.hidden ? "hidden" : "visible"]++;
    requestAnimationFrame(countFrame);
  };
  requestAnimationFrame(countFrame);

  // What the shared progress component shows: the run's state and its percent.
  const readRun = () => {
    // A toast's warning carries the same icon.
    const errorIcon = document.querySelector(".lucide-triangle-alert:not([data-sonner-toast] *)");
    if (errorIcon) return { state: "error", message: errorIcon.nextElementSibling?.lastElementChild?.textContent ?? "" };
    if (document.querySelector(".result-pop")) return { state: "done" };
    // A spinner over the picture has this role too.
    const line = document.querySelector('[role="status"]:has(> [aria-hidden])');
    const spinner = line?.parentElement?.querySelector(".animate-spin");
    if (spinner) {
      return {
        state: "processing",
        progress: Number(/(\d+)%/.exec(spinner.parentElement.textContent)?.[1] ?? NaN),
        // The hidden copies only hold the line's space.
        line: line.querySelector(":scope > span:not([aria-hidden])")?.textContent ?? null,
      };
    }
    return { state: "idle" };
  };
  check.readRun = readRun;

  const watchRun = () => {
    if (check.startAt === null || check.endAt !== null) return;
    const run = readRun();
    const title = document.title;
    if (check.titles.at(-1)?.title !== title) check.titles.push({ title, hidden: document.hidden, state: run.state });
    if (run.state === "processing") {
      check.progress = run.progress;
      if (check.lines.at(-1) !== run.line) check.lines.push(run.line);
    }
    if (run.state === "done" || run.state === "error") {
      check.endAt = performance.now();
      check.ending = run.state;
      check.error = run.message ?? null;
    }
  };
  new MutationObserver(watchRun).observe(document, { subtree: true, childList: true, characterData: true });

  /** The tool's primary button clicked, and the run's clock started (again, after a retry). */
  check.start = () => {
    check.startAt = performance.now();
    check.endAt = null;
    check.ending = null;
    check.error = null;
    check.titleAtStart = document.title;
    document.querySelector("button.btn-primary").click();
  };

  /** The longest freeze on screen (in ms) overlapping `from`..`to`; 0 when none passed 50 ms. */
  const longestFreeze = (from, to) =>
    check.freezes
      .filter((f) => f.start + f.duration >= from && f.start <= to)
      .reduce((longest, f) => Math.max(longest, f.duration), 0);

  /** A freeze is known at the frame after it, which a run's last commit may still be waiting for. */
  const nextFrames = () =>
    new Promise((done) => {
      setTimeout(done, 1000); // No frames come with the screen off.
      requestAnimationFrame(() => requestAnimationFrame(done));
    });

  /** What the run did, for the check to print and judge. */
  check.report = async () => {
    await nextFrames();
    const end = check.endAt ?? performance.now();
    const hiddenAt = check.visibility.find((v) => v.hidden);
    const shownAt = hiddenAt && check.visibility.find((v) => !v.hidden && v.at > hiddenAt.at);
    // The drawing's own contexts, not a live preview's from before the click.
    const drawing = check.contexts.filter((c) => c.createdAt >= check.startAt);
    return {
      ms: end - check.startAt,
      ending: check.ending,
      error: check.error,
      framesInRun: check.framesInRun,
      visibilityChanges: check.visibility.length,
      leftBeforeEnd: !!hiddenAt && hiddenAt.at < end,
      finishedWhileHidden: !!hiddenAt && (!shownAt || shownAt.at > end),
      hiddenMs: hiddenAt ? Math.max(0, Math.min(shownAt?.at ?? end, end) - hiddenAt.at) : 0,
      progressAtHide: hiddenAt?.progress ?? null,
      progressAtShow: shownAt?.progress ?? check.progress,
      runFreeze: longestFreeze(check.startAt, end),
      loadFreeze: longestFreeze(check.uploadedAt, check.startAt),
      drawingContexts: drawing.length,
      drawingContextsLost: drawing.filter((c) => c.lost).length,
      titleAtStart: check.titleAtStart,
      titleAtEnd: document.title,
      titles: check.titles,
      lines: check.lines,
    };
  };

  /** Every live WebGL context lost, as a GPU reset loses them all. */
  check.loseContexts = () => {
    for (const { gl, lose } of check.contexts) {
      if (lose && !gl.isContextLost()) lose.loseContext();
    }
  };

  /** The toasts showing. */
  check.toasts = () => [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.textContent);

  /** The error card's retry button clicked; false when there is none. */
  check.retry = () => {
    const icon = document.querySelector(".lucide-triangle-alert:not([data-sonner-toast] *)");
    const button = icon?.parentElement.querySelector("button");
    button?.click();
    return !!button;
  };

  /** How many WebGL contexts are alive and hold a drawing, by the pixel at the centre of each. */
  check.liveDrawings = () =>
    check.contexts.filter(({ gl }) => {
      if (gl.isContextLost()) return false;
      const pixel = new Uint8Array(4);
      gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return pixel[3] > 0;
    }).length;

  // "at-once": before the code that asked for the next new context has used it.
  // "create": just after it. "second": just after the one following it, as a
  // preview's full drawing follows its draft. "sized": once its canvas has left
  // the size it started at, which Paper's wait for its size depends on.
  const armedLoss = (canvas) => {
    const moment = check.lossArmedFor;
    if (!moment) return;
    check.lossArmedFor = moment === "second" ? "create" : null;
    if (moment === "second") return;
    if (moment === "at-once") return check.loseContexts();
    if (moment === "create") return void setTimeout(check.loseContexts);
    const startWidth = canvas.width;
    const poll = () => (canvas.width !== startWidth ? check.loseContexts() : requestAnimationFrame(poll));
    requestAnimationFrame(poll);
  };

  const getContext = HTMLCanvasElement.prototype.getContext;
  const known = new WeakSet();
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const gl = getContext.call(this, type, ...rest);
    if (gl && /^webgl/.test(type) && !known.has(this)) {
      known.add(this);
      // Asked now: a lost context no longer hands out its extensions.
      const context = { gl, lose: gl.getExtension("WEBGL_lose_context"), createdAt: performance.now(), lost: false };
      check.contexts.push(context);
      this.addEventListener("webglcontextlost", () => {
        context.lost = true;
      });
      armedLoss(this);
    }
    return gl;
  };
})();
