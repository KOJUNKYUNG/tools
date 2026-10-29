/**
 * The filter set on a canvas (CONTEXT "Filter set"): the plan for the
 * canvas's size baked into its pixels, the Paper filter's drawing laid first
 * and then the pure pixel filters, so the selected-background preview and
 * the applied picture run the same code.
 *
 * Browser-only: reads and writes a 2D canvas's pixels.
 */
import { filterPlan, isFiltered, type BackgroundKind, type FilterPlanStep, type FilterSet } from "./filterSet";
import { drawPaperFilter, type PaperStep } from "./paperFilterDrawing";
import { blur, grain, veil } from "./pixelFilters";
import type { PrepareStep } from "./slideImage";

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

/** The plan's Paper filter step, if it has one (always its first). */
export function paperStepOf(plan: FilterPlanStep[]): PaperStep | undefined {
  const [first] = plan;
  return first?.filter === "paper" ? first : undefined;
}

function context2d(canvas: AnyCanvas, willReadFrequently = false): OffscreenCanvasRenderingContext2D {
  // Both canvases' 2D contexts draw and read pixels alike; the union of the
  // two context types has no common getContext signature.
  const ctx = (canvas as OffscreenCanvas).getContext("2d", { willReadFrequently });
  if (!ctx) throw new Error("no 2d canvas context");
  return ctx;
}

/** Bake `plan`'s blur, veil and grain into `canvas`'s pixels. */
function bakePixelFilters(canvas: AnyCanvas, plan: FilterPlanStep[]): void {
  if (!plan.some((step) => step.filter !== "paper")) return;
  const { width, height } = canvas;
  const ctx = context2d(canvas, true);
  const image = ctx.getImageData(0, 0, width, height);
  for (const step of plan) {
    switch (step.filter) {
      case "paper":
        // Laid before the pixel filters, from its WebGL drawing.
        break;
      case "blur":
        blur(image.data, width, height, step.radius);
        break;
      case "veil":
        veil(image.data, step.amount);
        break;
      case "grain":
        grain(image.data, width, height, { amount: step.amount, cell: step.cell, seed: step.seed });
        break;
      default:
        // A step added to the plan without its filter here fails to compile.
        step satisfies never;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/**
 * Bake `plan` (made for `canvas`'s size) into `canvas`: `paperDrawn`, Paper's
 * drawing for the plan's Paper filter step, laid over the picture at the
 * step's strength (blending with the unfiltered picture), then blur, veil and
 * grain. `paperDrawn` is needed when the plan has a Paper step.
 */
export function composeFilters(canvas: AnyCanvas, plan: FilterPlanStep[], paperDrawn?: HTMLCanvasElement): void {
  const paperStep = paperStepOf(plan);
  if (paperStep) {
    if (!paperDrawn) throw new Error("the plan's Paper filter has no drawing");
    const ctx = context2d(canvas);
    ctx.save();
    ctx.globalAlpha = paperStep.strength;
    ctx.drawImage(paperDrawn, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
  bakePixelFilters(canvas, plan);
}

/**
 * Bake `filters` for a `kind` background into `canvas`, planned for its own
 * size. Rejects when the Paper filter fails to draw.
 */
export async function bakeFilters(canvas: AnyCanvas, filters: FilterSet, kind: BackgroundKind): Promise<void> {
  const plan = filterPlan(filters, kind, { width: canvas.width, height: canvas.height });
  const paperStep = paperStepOf(plan);
  composeFilters(canvas, plan, paperStep && (await drawPaperFilter(canvas, paperStep)));
}

/**
 * The preparation step that bakes `filters` into a fitted `kind` picture,
 * or none when they change nothing: an unfiltered pick is prepared exactly
 * as without the filter set (a whole JPEG is not re-encoded).
 */
export function filterStep(filters: FilterSet, kind: BackgroundKind): PrepareStep | undefined {
  if (!isFiltered(filters, kind)) return undefined;
  return async (fitted) => {
    await bakeFilters(fitted, filters, kind);
    return fitted;
  };
}
