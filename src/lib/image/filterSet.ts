/**
 * The filter set (CONTEXT "Filter set"): which effects the edit area offers
 * for a background, how its state answers the tool's steps, whether it
 * changes the picture, and the steps it bakes into a picture of a given size.
 * Pure: the pixels are pixelFilters.ts's, the canvas the tool's.
 */
import type { SliderRange } from "@/lib/gallery/recipeEdit";
import type { PixelSize } from "./slideImage";

/** What the user picked as the new background. */
export type BackgroundKind = "picture" | "solid" | "none";

/** What the user set on the effects group: strengths as shares of the picture, never pixels. */
export interface FilterSet {
  /** The veil: below 0 darkens, above 0 lightens, as a share of the way to black or white. */
  veil: number;
}

/** The effects group's sliders, each null where the background does not take it (hidden). */
export interface OfferedFilters {
  veil: SliderRange | null;
}

// [임시] range until the spec-end visual QA: −60% (dark) to +60% (light).
const VEIL: SliderRange = { min: -0.6, max: 0.6, step: 0.01, shown: { times: 100, suffix: "%" } };

/**
 * The effects group for a background, or null where it has none ("no
 * background" is the theme's colour by definition). A solid colour takes
 * only the filters that change a flat colour, so not the veil, which would
 * only change the colour picked.
 */
export function filtersFor(kind: BackgroundKind, _webgl2: boolean): OfferedFilters | null {
  if (kind === "none") return null;
  return { veil: kind === "picture" ? VEIL : null };
}

/** No filter: the picture as it is. */
export const NO_FILTERS: FilterSet = { veil: 0 };

/** A step of the tool that the filter state answers to. */
export type FilterStep = "pick" | "again" | "reset" | "recipeReset";

/**
 * What happens to the filters across the tool (CONTEXT "Filter set"): they
 * stay set when another background is picked, so backgrounds compare under
 * the same effects, and after 다시 하기; the effects group's reset clears
 * them, and the recipe edit's reset ("shape") leaves them, as the effects
 * reset leaves the recipe edit.
 */
export function filtersAfter(filters: FilterSet, step: FilterStep): FilterSet {
  return step === "reset" ? NO_FILTERS : filters;
}

/** One filter baked into the picture, in the pixels of the size it was planned for. */
export type FilterPlanStep = { filter: "veil"; amount: number };

/**
 * The filters `filters` bakes into a `kind` background of `size` (the
 * fitted picture), in the fixed order Paper filter → blur → veil → grain;
 * only those the background takes, so a value hidden for a solid colour is
 * kept but not applied. Strengths held as shares of the picture become
 * pixel values for `size`; the veil is a share of the way to black or white
 * at any size.
 */
export function filterPlan(filters: FilterSet, kind: BackgroundKind, _size: PixelSize): FilterPlanStep[] {
  // What the background takes whatever the browser: a Paper filter is only
  // ever chosen where WebGL2 offered it.
  const offered = filtersFor(kind, true);
  const plan: FilterPlanStep[] = [];
  if (offered?.veil && filters.veil !== 0) plan.push({ filter: "veil", amount: filters.veil });
  return plan;
}

/**
 * Whether `filters` would change a `kind` background: whether the picture
 * path runs the filter step, and whether a solid colour goes in as a colour
 * or as a picture.
 */
export function isFiltered(filters: FilterSet, kind: BackgroundKind): boolean {
  // The steps are the same at every size; only their pixel values differ.
  return filterPlan(filters, kind, { width: 1, height: 1 }).length > 0;
}
