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

function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The drawing could not be read"))), "image/png"),
  );
}

/**
 * `props` (a recipe with an edit applied) drawn at the gallery file's size
 * and composition, as a PNG file for the picture path.
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
  /** `props` drawn at the preview size, as a PNG. */
  draw(props: PaperRecipe): Promise<Blob>;
  dispose(): void;
}

/** Open a preview for `props`'s shader. */
export async function openRecipePreview(props: PaperRecipe): Promise<RecipePreview> {
  const drawing = await loadDrawing();
  const el = hostElement();
  let mount: Mount;
  try {
    mount = await drawing.mountStill(el, props, { preserveDrawingBuffer: true, pixelRatio: PREVIEW_RATIO });
    await drawing.settled(mount, PREVIEW_RATIO);
  } catch (err) {
    el.remove();
    throw err;
  }
  return {
    async draw(next) {
      drawing.updateStill(mount, next);
      return canvasPng(mount.canvasElement);
    },
    dispose() {
      mount.dispose();
      el.remove();
    },
  };
}

