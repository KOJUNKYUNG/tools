// Draws an edited gallery recipe in the browser (CONTEXT "Recipe edit"), with
// the gallery scripts' own drawing code (scripts/gallery/paper-draw.js) and
// prop table, so an edit is drawn exactly as the gallery file was. Paper Shaders
// and the table load on first use only: the tool's first load does not carry
// them.

import { contextLost, LostContextError, loadPaperDrawing, paperHost, watchingContext, watchLeaving } from "./paperRuntime";
import type { PaperRecipe } from "./recipes";

/**
 * Pixel ratio of an applied drawing: 3840 × 2160, the gallery file's size,
 * so the user's crop (held in the file's pixels) applies to it unchanged.
 */
const APPLY_RATIO = 3;

/** Pixel ratio of the live preview: 1280 × 720, the same composition. */
const PREVIEW_RATIO = 1;

/** The drawing as a PNG; a lost WebGL context is refused, since its canvas reads blank. */
function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  if (contextLost(canvas)) return Promise.reject(new LostContextError());
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The drawing could not be read"))), "image/png"),
  );
}

/**
 * `props` (a recipe with an edit applied) drawn at the gallery file's size
 * and composition, as a PNG file for the picture path. Rejects when the
 * drawing fails (a lost context, as a LostContextError; a canvas held below
 * that size, no memory): there is no unedited file to fall back to.
 */
export async function drawRecipeFile(props: PaperRecipe): Promise<File> {
  const drawing = await loadPaperDrawing();
  const el = paperHost();
  try {
    const start = performance.now();
    const blob = await watchingContext(el, () => drawing.drawStill(el, props, APPLY_RATIO, canvasPng));
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
  /** Draw `props` on the canvas now; throws a LostContextError when its context is lost (it would copy blank). */
  draw(props: PaperRecipe): void;
  dispose(): void;
}

/** Open a preview for `props`'s shader. `onLost` hears of its context lost later, not of the loss `dispose` causes. */
export async function openRecipePreview(props: PaperRecipe, onLost: (err: LostContextError) => void): Promise<RecipePreview> {
  const drawing = await loadPaperDrawing();
  const el = paperHost();
  const opened = await watchingContext(el, async () => {
    const mounted = await drawing.mountStill(el, props, { preserveDrawingBuffer: true, pixelRatio: PREVIEW_RATIO });
    // A mount whose canvas never settled still holds a WebGL context.
    try {
      await drawing.settled(mounted, PREVIEW_RATIO);
      if (contextLost(mounted.canvasElement)) throw new LostContextError();
    } catch (err) {
      mounted.dispose();
      throw err;
    }
    return mounted;
  }).catch((err: unknown) => {
    el.remove();
    throw err;
  });
  // A loss since the last drawing that held: an old absence says nothing of a later one.
  const leaving = watchLeaving();
  const lost = () => onLost(new LostContextError(leaving.left()));
  opened.canvasElement.addEventListener("webglcontextlost", lost);
  return {
    canvas: opened.canvasElement,
    draw(next) {
      // Paper draws a still at once when its props change.
      drawing.updateStill(opened, next);
      if (contextLost(opened.canvasElement)) throw new LostContextError(leaving.left());
      leaving.reset();
    },
    dispose() {
      opened.canvasElement.removeEventListener("webglcontextlost", lost);
      leaving.stop();
      opened.dispose();
      el.remove();
    },
  };
}

