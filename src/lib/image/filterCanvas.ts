/**
 * The filter set on a canvas (CONTEXT "Filter set"): the plan for the
 * canvas's size baked into its pixels by the pure pixel filters, so the
 * selected-background preview and the applied picture run the same code.
 *
 * Browser-only: reads and writes a 2D canvas's pixels.
 */
import { filterPlan, isFiltered, type BackgroundKind, type FilterSet } from "./filterSet";
import { blur, grain, veil } from "./pixelFilters";
import type { PrepareStep } from "./slideImage";

/** Bake `filters` for a `kind` background into `canvas`, planned for its own size. */
export function bakeFilters(canvas: OffscreenCanvas | HTMLCanvasElement, filters: FilterSet, kind: BackgroundKind): void {
  const { width, height } = canvas;
  const plan = filterPlan(filters, kind, { width, height });
  if (plan.length === 0) return;
  // Both canvases' 2D contexts read and write pixels alike; the union of the
  // two context types has no common getContext signature.
  const ctx = (canvas as OffscreenCanvas).getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d canvas context");
  const image = ctx.getImageData(0, 0, width, height);
  for (const step of plan) {
    switch (step.filter) {
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
 * The preparation step that bakes `filters` into a fitted `kind` picture,
 * or none when they change nothing: an unfiltered pick is prepared exactly
 * as without the filter set (a whole JPEG is not re-encoded).
 */
export function filterStep(filters: FilterSet, kind: BackgroundKind): PrepareStep | undefined {
  if (!isFiltered(filters, kind)) return undefined;
  return (fitted) => {
    bakeFilters(fitted, filters, kind);
    return fitted;
  };
}
