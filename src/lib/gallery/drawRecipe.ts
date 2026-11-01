// Draws an edited gallery recipe in the browser (CONTEXT "Recipe edit"), with
// the gallery scripts' own drawing code (scripts/gallery/paper-draw.js) and
// prop table, so an edit is drawn exactly as the gallery file was. Paper Shaders
// and the table load on first use only: the tool's first load does not carry
// them.

import { loadPaperDrawing, paperHost, type PaperDrawing } from "./paperRuntime";
import type { PaperRecipe } from "./recipes";

/**
 * Pixel ratio of an applied drawing: 3840 × 2160, the gallery file's size,
 * so the user's crop (held in the file's pixels) applies to it unchanged.
 */
const APPLY_RATIO = 3;

/** Pixel ratio of the live preview: 1280 × 720, the same composition. */
const PREVIEW_RATIO = 1;

/** Paper's ShaderMount, as paper-draw.js mounts it. */
type Mount = Awaited<ReturnType<PaperDrawing["mountStill"]>>;

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
  const drawing = await loadPaperDrawing();
  const el = paperHost();
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
  const drawing = await loadPaperDrawing();
  const el = paperHost();
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

