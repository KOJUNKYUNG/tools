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
