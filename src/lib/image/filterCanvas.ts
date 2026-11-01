/**
 * The filter set on a canvas (CONTEXT "Filter set"): the plan for the
 * canvas's size baked into its pixels, in two parts around the Paper filter
 * (the adjustments its drawing starts from, then its drawing laid with the
 * overlays and grain), so the selected-background preview and the applied
 * picture run the same code.
 *
 * Browser-only: reads and writes a 2D canvas's pixels.
 */
import { bakesPicture, filterPlan, type BackgroundKind, type FilterPlanStep, type FilterSet } from "./filterSet";
import { drawPaperFilter, type PaperStep } from "./paperFilterDrawing";
import { blur, contrast, grain, overlay, saturate, veil } from "./pixelFilters";
import type { PrepareStep } from "./slideImage";

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

/** The plan's Paper filter step, if it has one. */
export function paperStepOf(plan: FilterPlanStep[]): PaperStep | undefined {
  return plan.find((step): step is PaperStep => step.filter === "paper");
}

/** The plan's steps before its Paper filter (the adjustments it is drawn from), and after it. */
function splitPlan(plan: FilterPlanStep[]): { before: FilterPlanStep[]; after: FilterPlanStep[] } {
  const at = plan.findIndex((step) => step.filter === "paper");
  return at < 0 ? { before: [], after: plan } : { before: plan.slice(0, at), after: plan.slice(at + 1) };
}

function context2d(canvas: AnyCanvas, willReadFrequently = false): OffscreenCanvasRenderingContext2D {
  // Both canvases' 2D contexts draw and read pixels alike; the union of the
  // two context types has no common getContext signature.
  const ctx = (canvas as OffscreenCanvas).getContext("2d", { willReadFrequently });
  if (!ctx) throw new Error("no 2d canvas context");
  return ctx;
}

/** Bake `steps`, pixel filters only, into `canvas`'s pixels. */
function bakePixelFilters(canvas: AnyCanvas, steps: FilterPlanStep[]): void {
  if (!steps.some((step) => step.filter !== "paper")) return;
  const { width, height } = canvas;
  const ctx = context2d(canvas, true);
  const image = ctx.getImageData(0, 0, width, height);
  for (const step of steps) {
    switch (step.filter) {
      case "paper":
        // Laid from its WebGL drawing, between the two parts.
        break;
      case "blur":
        blur(image.data, width, height, step.radius);
        break;
      case "saturation":
        saturate(image.data, step.amount);
        break;
      case "contrast":
        contrast(image.data, step.amount);
        break;
      case "overlay":
        overlay(image.data, step.colour, step.amount);
        break;
      case "veil":
        veil(image.data, step.amount);
        break;
      case "grain":
        grain(image.data, width, height, step);
        break;
      default:
        // A step added to the plan without its filter here fails to compile.
        step satisfies never;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/**
 * Bake the first part of `plan` (made for `canvas`'s size) into `canvas`:
 * the adjustments before its Paper filter, which the filter is drawn from.
 * Nothing when the plan has no Paper filter: then every step is the second
 * part's.
 */
export function adjustFilters(canvas: AnyCanvas, plan: FilterPlanStep[]): void {
  bakePixelFilters(canvas, splitPlan(plan).before);
}

/**
 * Bake the second part of `plan` into `canvas`, adjusted by adjustFilters:
 * `paperDrawn`, Paper's drawing for the plan's Paper filter step, laid over
 * the picture at the step's strength (blending with the adjusted picture),
 * then the steps after it. `paperDrawn` is needed when the plan has a Paper
 * step.
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
  bakePixelFilters(canvas, splitPlan(plan).after);
}

/**
 * Bake `filters` for a `kind` background into `canvas`, planned for its own
 * size. Rejects when the Paper filter fails to draw.
 */
export async function bakeFilters(canvas: AnyCanvas, filters: FilterSet, kind: BackgroundKind): Promise<void> {
  const plan = filterPlan(filters, kind, { width: canvas.width, height: canvas.height });
  const paperStep = paperStepOf(plan);
  adjustFilters(canvas, plan);
  composeFilters(canvas, plan, paperStep && (await drawPaperFilter(canvas, paperStep)));
}

/**
 * The preparation step that bakes `filters` into a fitted `kind` picture,
 * or none when they make no picture: an unfiltered pick is prepared exactly
 * as without the filter set (a whole JPEG is not re-encoded), and a solid
 * colour whose effects only change its colour stays a fill.
 */
export function filterStep(filters: FilterSet, kind: BackgroundKind): PrepareStep | undefined {
  if (!bakesPicture(filters, kind)) return undefined;
  return async (fitted) => {
    await bakeFilters(fitted, filters, kind);
    return fitted;
  };
}
