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
    lostEvents: 0,
    lossArmedFor: null,
    marks: {},
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
    const line = document.querySelector('[role="status"]');
    const spinner = line?.parentElement?.querySelector(".animate-spin");
    if (spinner) return { state: "processing", progress: Number(/(\d+)%/.exec(spinner.parentElement.textContent)?.[1] ?? NaN) };
    return { state: "idle" };
  };
  check.readRun = readRun;

  const watchRun = () => {
    if (check.startAt === null || check.endAt !== null) return;
    const run = readRun();
    if (run.state === "processing") check.progress = run.progress;
    if (run.state === "done" || run.state === "error") {
      check.endAt = performance.now();
      check.ending = run.state;
      check.error = run.message ?? null;
    }
  };
  new MutationObserver(watchRun).observe(document, { subtree: true, childList: true, characterData: true });

  /** The tool's primary button clicked, and the run's clock started. */
  check.start = () => {
    check.startAt = performance.now();
    document.querySelector("button.btn-primary").click();
  };

  /** The longest freeze on screen (in ms) overlapping `from`..`to`; 0 when none passed 50 ms. */
  check.longestFreeze = (from, to) =>
    check.freezes
      .filter((f) => f.start + f.duration >= from && f.start <= to)
      .reduce((longest, f) => Math.max(longest, f.duration), 0);

  /** Every live WebGL context lost, as a GPU reset loses them all. */
  check.loseContexts = () => {
    let lost = 0;
    for (const { gl, lose } of check.contexts) {
      if (lose && !gl.isContextLost()) {
        lose.loseContext();
        lost++;
      }
    }
    return lost;
  };

  // "create": just after the next new context. "sized": once its canvas has
  // left the size it started at, which Paper's wait for its size depends on.
  const armedLoss = (canvas) => {
    const moment = check.lossArmedFor;
    if (!moment) return;
    check.lossArmedFor = null;
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
      check.contexts.push({ gl, lose: gl.getExtension("WEBGL_lose_context") });
      this.addEventListener("webglcontextlost", () => check.lostEvents++);
      armedLoss(this);
    }
    return gl;
  };
})();
