// Paper Shaders in the browser, shared by the recipe edit (drawRecipe.ts) and
// the filter set's Paper filters (src/lib/image/paperFilterDrawing.ts): the
// gallery scripts' own drawing code (scripts/gallery/paper-draw.js) bound to
// Paper and its prop table, which load on first use only, so the tool's
// first load does not carry them.

import { paperDrawing } from "../../../scripts/gallery/paper-draw.js";

// paper-draw.js is plain JS (allowJs, not type-checked): its helpers' types
// are inferred loosely, and the mount is Paper's ShaderMount.
export type PaperDrawing = ReturnType<typeof paperDrawing>;

let loading: Promise<PaperDrawing> | null = null;

/** Paper Shaders and the prop table, loaded once. */
export function loadPaperDrawing(): Promise<PaperDrawing> {
  loading ??= Promise.all([
    import("@paper-design/shaders"),
    import("../../../scripts/gallery/paper-props.json"),
  ]).then(([paper, props]) => paperDrawing(paper, props.default));
  // A failed load (offline) may be tried again.
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/**
 * A drawing failed because its WebGL context was lost. `afterLeaving`: the user
 * left the screen while it was drawing (CONTEXT "Leaving the screen"), so that,
 * not the browser's memory, is the likely cause.
 */
export class LostContextError extends Error {
  override name = "LostContextError";
  constructor(readonly afterLeaving = false) {
    super("The drawing lost its WebGL context");
  }
}

/** Whether `canvas`, a Paper canvas, has lost its context: it then reads blank. */
export function contextLost(canvas: HTMLCanvasElement): boolean {
  // The canvas's own context: getContext hands back the WebGL2 one Paper made
  // (Paper Shaders draw with WebGL2 only). None at all was refused, not lost.
  return canvas.getContext("webgl2")?.isContextLost() ?? false;
}

/**
 * Watches for the user leaving the screen: `left` says whether they have since
 * this began, or since `reset`. `stop` ends the watch.
 */
export function watchLeaving(): { left: () => boolean; reset: () => void; stop: () => void } {
  let left = document.hidden;
  const change = () => {
    left ||= document.hidden;
  };
  document.addEventListener("visibilitychange", change);
  return {
    left: () => left,
    reset: () => {
      left = document.hidden;
    },
    stop: () => document.removeEventListener("visibilitychange", change),
  };
}

/**
 * `draw`, a drawing in `host`, with a lost context told apart from its other
 * failures: refused where the drawing is read, or found on a canvas Paper could
 * not mount (it stays in `host` then).
 */
export async function watchingContext<T>(host: HTMLElement, draw: () => Promise<T>): Promise<T> {
  const leaving = watchLeaving();
  try {
    return await draw();
  } catch (err) {
    const unmounted = host.querySelector("canvas");
    if (err instanceof LostContextError || (unmounted && contextLost(unmounted))) {
      throw new LostContextError(leaving.left());
    }
    throw err;
  } finally {
    leaving.stop();
  }
}

let webgl2: boolean | null = null;

/** Whether this browser can draw Paper Shaders, which need WebGL2. */
export function webgl2Available(): boolean {
  if (webgl2 === null) {
    const gl = document.createElement("canvas").getContext("webgl2");
    webgl2 = gl !== null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }
  return webgl2;
}

/**
 * An element to draw in, off screen; the drawing lays it out at its CSS size
 * (the still's 1280 × 720, or a filter's box), which the composition depends on.
 */
export function paperHost(): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, { position: "fixed", left: "-20000px", top: "0", pointerEvents: "none" });
  document.body.append(el);
  return el;
}
