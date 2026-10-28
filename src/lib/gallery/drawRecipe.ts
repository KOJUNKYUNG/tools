// Draws an edited gallery recipe in the browser (CONTEXT "Recipe edit"), with
// the gallery scripts' own drawing code (scripts/gallery/paper-draw.js) and
// prop table, so an edit is drawn exactly as the gallery file was. Paper Shaders
// and the table load on first use only: the tool's first load does not carry
// them.

import { paperDrawing } from "../../../scripts/gallery/paper-draw.js";
import type { PaperRecipe } from "./recipes";

/**
 * Pixel ratio of an applied drawing: 3840 × 2160, the gallery file's size,
 * so the user's crop (held in the file's pixels) applies to it unchanged.
 */
const APPLY_RATIO = 3;

/** Pixel ratio of the live preview: 1280 × 720, the same composition. */
const PREVIEW_RATIO = 1;

// paper-draw.js is plain JS (allowJs, not type-checked): its helpers' types
// are inferred loosely, and the mount is Paper's ShaderMount.
type Drawing = ReturnType<typeof paperDrawing>;
type Mount = Awaited<ReturnType<Drawing["mountStill"]>>;

let loading: Promise<Drawing> | null = null;

function loadDrawing(): Promise<Drawing> {
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
 * An element to draw in: laid out at the still's 1280 × 720 CSS size (the
 * composition depends on it) but off screen.
 */
function hostElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, { position: "fixed", left: "-20000px", top: "0", pointerEvents: "none" });
  document.body.append(el);
  return el;
}

/** The drawing as a PNG; a lost WebGL context is refused, since its canvas reads blank. */
function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  // The canvas's own context: getContext hands back the WebGL2 one Paper made
  // (Paper Shaders draw with WebGL2 only).
  const gl = canvas.getContext("webgl2");
  if (!gl || gl.isContextLost()) return Promise.reject(new Error("The drawing lost its WebGL context"));
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The drawing could not be read"))), "image/png"),
  );
}

/**
 * `props` (a recipe with an edit applied) drawn at the gallery file's size
 * and composition, as a PNG file for the picture path. Rejects when the
 * drawing fails (a lost context, a canvas held below that size, no memory):
 * there is no unedited file to fall back to.
 */
export async function drawRecipeFile(props: PaperRecipe): Promise<File> {
  const drawing = await loadDrawing();
  const el = hostElement();
  try {
    const start = performance.now();
    const blob = await drawing.drawStill(el, props, APPLY_RATIO, canvasPng);
    // User timing for the 4K budget (a fraction of a second to a couple of seconds).
    performance.measure("ontab:recipe-draw", { start, end: performance.now() });
    return new File([blob], `gallery-${props.name}-edited.png`, { type: "image/png" });
  } finally {
    el.remove();
  }
}

/** A live preview: one mount kept while the user edits, drawn again on each change. */
export interface RecipePreview {
  /** The canvas the preview is drawn on, at the preview size, to be copied where the pick shows. */
  canvas: HTMLCanvasElement;
  /** Draw `props` on the canvas now; throws when its WebGL context is lost (it would copy blank). */
  draw(props: PaperRecipe): void;
  dispose(): void;
}

/** Open a preview for `props`'s shader. */
export async function openRecipePreview(props: PaperRecipe): Promise<RecipePreview> {
  const drawing = await loadDrawing();
  const el = hostElement();
  let mount: Mount | undefined;
  try {
    mount = await drawing.mountStill(el, props, { preserveDrawingBuffer: true, pixelRatio: PREVIEW_RATIO });
    await drawing.settled(mount, PREVIEW_RATIO);
  } catch (err) {
    // A mount whose canvas never settled still holds a WebGL context.
    mount?.dispose();
    el.remove();
    throw err;
  }
  const opened = mount;
  return {
    canvas: opened.canvasElement,
    draw(next) {
      // Paper draws a still at once when its props change.
      drawing.updateStill(opened, next);
      const gl = opened.canvasElement.getContext("webgl2");
      if (!gl || gl.isContextLost()) throw new Error("The preview lost its WebGL context");
    },
    dispose() {
      opened.dispose();
      el.remove();
    },
  };
}

