/**
 * The filter set's Paper image filters, drawn (CONTEXT "Filter set"): the
 * picture handed to the filter's shader as its input, drawn on the step's
 * CSS box at its pixel ratio with the gallery scripts' drawing code, then
 * laid over the picture at the step's strength. Paper Shaders load on first
 * use, as the recipe edit's do.
 *
 * Browser-only: WebGL2 and 2D canvases.
 */
import { loadPaperDrawing, paperHost } from "@/lib/gallery/drawRecipe";
import type { FilterPlanStep } from "./filterSet";
import { fillingProps, PAPER_FILTERS } from "./paperFilters";

/** The plan's Paper filter step. */
export type PaperStep = Extract<FilterPlanStep, { filter: "paper" }>;

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

/**
 * The picture as a decoded image: Paper takes only an HTMLImageElement as a
 * texture. PNG, so the filter starts from the picture's own pixels. The
 * canvas is read when this is called.
 */
async function asImage(canvas: AnyCanvas): Promise<{ image: HTMLImageElement; release: () => void }> {
  const blob =
    canvas instanceof HTMLCanvasElement
      ? await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The picture could not be read"))), "image/png"),
        )
      : await canvas.convertToBlob({ type: "image/png" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  return { image, release: () => URL.revokeObjectURL(url) };
}

/** Paper's canvas copied at `width` × `height`; a lost WebGL context is refused, since its canvas reads blank. */
function copyOut(canvas: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  // The canvas's own context: Paper draws with WebGL2 only.
  const gl = canvas.getContext("webgl2");
  if (!gl || gl.isContextLost()) throw new Error("The filter lost its WebGL context");
  const copy = document.createElement("canvas");
  copy.width = width;
  copy.height = height;
  const ctx = copy.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas context");
  // Paper's canvas is within a pixel of the size (it rounds a ratio that is not whole).
  ctx.drawImage(canvas, 0, 0, width, height);
  return copy;
}

/**
 * `step`'s Paper filter drawn over `picture`, at the picture's size, to be
 * laid over it. Rejects when the drawing fails (a lost context, a canvas
 * held below the size, no memory): the picture never stands in for it.
 */
export async function drawPaperFilter(picture: AnyCanvas, step: PaperStep): Promise<HTMLCanvasElement> {
  const { width, height } = picture;
  // The picture is read now, while Paper loads.
  const input = asImage(picture);
  let drawing;
  try {
    drawing = await loadPaperDrawing();
  } catch (err) {
    input.then(({ release }) => release(), () => {});
    throw err;
  }
  const { image, release } = await input;
  const { shader, preset } = PAPER_FILTERS[step.paper];
  // The picture fills the box whatever the preset frames it at.
  const spec = { shader, ...fillingProps(drawing.presetParams(shader, preset)), image };
  const el = paperHost();
  try {
    const start = performance.now();
    const drawn = await drawing.drawStill(
      el,
      spec,
      step.pixelRatio,
      (canvas: HTMLCanvasElement) => copyOut(canvas, width, height),
      step.box,
    );
    // User timing for the 4K budget, as the recipe drawing's.
    performance.measure("ontab:paper-filter", { start, end: performance.now() });
    return drawn;
  } finally {
    el.remove();
    release();
  }
}

/** Lay Paper's `drawn` filter over `picture` at `strength` (0 to 1), blending it with the unfiltered picture. */
export function layPaperFilter(picture: AnyCanvas, drawn: HTMLCanvasElement, strength: number): void {
  // Both canvases' 2D contexts draw alike; the union of the two context types has no common getContext signature.
  const ctx = (picture as OffscreenCanvas).getContext("2d");
  if (!ctx) throw new Error("no 2d canvas context");
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.drawImage(drawn, 0, 0, picture.width, picture.height);
  ctx.restore();
}
