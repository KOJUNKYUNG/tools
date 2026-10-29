/**
 * The filter set on a canvas (CONTEXT "Filter set"): the plan for the
 * canvas's size baked into its pixels, the Paper filter first and then the
 * pure pixel filters, so the selected-background preview and the applied
 * picture run the same code.
 *
 * Browser-only: reads and writes a 2D canvas's pixels.
 */
import { filterPlan, isFiltered, type BackgroundKind, type FilterPlanStep, type FilterSet } from "./filterSet";
import { drawPaperFilter, layPaperFilter } from "./paperFilterDrawing";
import { blur, grain, veil } from "./pixelFilters";
import type { PrepareStep } from "./slideImage";

/** The plan's Paper filter step, if it has one (always its first). */
export function paperStepOf(plan: FilterPlanStep[]) {
  const [first] = plan;
  return first?.filter === "paper" ? first : undefined;
}

/** Bake `plan`'s blur, veil and grain into `canvas`; its Paper filter is laid before, by the caller. */
export function bakePixelFilters(canvas: OffscreenCanvas | HTMLCanvasElement, plan: FilterPlanStep[]): void {
  if (!plan.some((step) => step.filter !== "paper")) return;
  const { width, height } = canvas;
  // Both canvases' 2D contexts read and write pixels alike; the union of the
  // two context types has no common getContext signature.
  const ctx = (canvas as OffscreenCanvas).getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d canvas context");
  const image = ctx.getImageData(0, 0, width, height);
  for (const step of plan) {
    switch (step.filter) {
      case "paper":
        // Drawn with WebGL, before the pixel filters.
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
 * Bake `filters` for a `kind` background into `canvas`, planned for its own
 * size. Rejects when the Paper filter fails to draw.
 */
export async function bakeFilters(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  filters: FilterSet,
  kind: BackgroundKind,
): Promise<void> {
  const plan = filterPlan(filters, kind, { width: canvas.width, height: canvas.height });
  const paper = paperStepOf(plan);
  if (paper) layPaperFilter(canvas, await drawPaperFilter(canvas, paper), paper.strength);
  bakePixelFilters(canvas, plan);
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
