/**
 * The filter set (CONTEXT "Filter set"): which effects the edit area offers
 * for a background, how its state answers the tool's steps, whether it
 * changes the picture, and the steps it bakes into a picture of a given size.
 * Pure: the pixels are pixelFilters.ts's, the canvas the tool's.
 */
import type { SliderRange } from "@/lib/gallery/recipeEdit";
import { PAPER_FILTER_NAMES, type PaperFilter } from "./paperFilters";
import type { PixelSize } from "./slideImage";

/** What the user picked as the new background. */
export type BackgroundKind = "picture" | "solid" | "none";

/** What the user set on the effects group: strengths as shares of the picture, never pixels. */
export interface FilterSet {
  /** The blur's standard deviation, as a share of the picture's width. */
  blur: number;
  /** The veil: below 0 darkens, above 0 lightens, as a share of the way to black or white. */
  veil: number;
  /** The grain's largest change, as a share of full scale. */
  grain: number;
  /** The one Paper filter laid over the picture, or none. */
  paper: PaperFilter | null;
  /** The share of the Paper filter's drawing laid over the unfiltered picture. */
  paperStrength: number;
}

/** The effects group's controls, each null where the background does not take it (hidden). */
export interface OfferedFilters {
  blur: SliderRange | null;
  veil: SliderRange | null;
  grain: SliderRange | null;
  /** The one-of choice of Paper filter ("none" besides these) and its strength; none without WebGL2. */
  paper: { filters: readonly PaperFilter[]; strength: SliderRange } | null;
}

// [임시] ranges until the spec-end visual QA.
/** 0 to 2% of the width. */
const BLUR: SliderRange = { min: 0, max: 0.02, step: 0.0005, shown: { times: 100, suffix: "%" } };
/** −60% (dark) to +60% (light). */
const VEIL: SliderRange = { min: -0.6, max: 0.6, step: 0.01, shown: { times: 100, suffix: "%" } };
/** 0 to 0.2, read 0 to 20. */
const GRAIN: SliderRange = { min: 0, max: 0.2, step: 0.005, shown: { times: 100 } };
/** 0 to 100%: the share of the Paper filter's drawing laid over the picture. */
const STRENGTH: SliderRange = { min: 0, max: 1, step: 0.01, shown: { times: 100, suffix: "%" } };

/** A Paper drawing's layout size, in CSS px. */
export interface CssBox {
  cssWidth: number;
  cssHeight: number;
}

/** The short side of a Paper filter's box: the gallery stills' 1280 × 720 for a 16:9 slide. */
const PAPER_BOX_SIDE = 720;

/** The long side at which a grain cell is 1 px: Full HD's, in either orientation. */
const GRAIN_CELL_SIDE = 1920;
/** The grain's one pattern, shared by every size of a picture. */
const GRAIN_SEED = 1;

/**
 * The effects group for a background, or null where it has none ("no
 * background" is the theme's colour by definition). A solid colour takes
 * only the filters that change a flat colour, so not blur, which changes
 * nothing on it, or the veil, which would only change the colour picked.
 */
export function filtersFor(kind: BackgroundKind, webgl2: boolean): OfferedFilters | null {
  if (kind === "none") return null;
  const picture = kind === "picture";
  // Grain and the Paper filters on a solid colour come with its effects area (#131).
  return {
    blur: picture ? BLUR : null,
    veil: picture ? VEIL : null,
    grain: picture ? GRAIN : null,
    // Paper's filters draw with WebGL2 only.
    paper: picture && webgl2 ? { filters: PAPER_FILTER_NAMES, strength: STRENGTH } : null,
  };
}

/** No filter: the picture as it is; a Paper filter picked from here comes at full strength. */
export const NO_FILTERS: FilterSet = { blur: 0, veil: 0, grain: 0, paper: null, paperStrength: 1 };

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
export type FilterPlanStep =
  /**
   * `strength`: the share of the drawing laid over the picture; `box`: the
   * CSS size the drawing is laid out at, which sets its composition;
   * `pixelRatio`: the ratio at which the box reaches the picture's pixels.
   */
  | { filter: "paper"; paper: PaperFilter; strength: number; box: CssBox; pixelRatio: number }
  /** `radius`: the Gaussian's standard deviation, in px. */
  | { filter: "blur"; radius: number }
  | { filter: "veil"; amount: number }
  /** `cell`: a grain cell's side, in px; `seed`: the pattern. */
  | { filter: "grain"; amount: number; cell: number; seed: number };

/**
 * The filters `filters` bakes into a `kind` background of `size` (the
 * fitted picture), in the fixed order Paper filter → blur → veil → grain;
 * only those the background takes, so a value hidden for a solid colour is
 * kept but not applied. Strengths held as shares of the picture become
 * pixel values for `size`, so every size of a picture looks alike: the
 * blur's radius is a share of the width, and grain cells are 1 px at Full
 * HD (by the long side, so a portrait slide's too), scaled with the size, in
 * one pattern. The veil is a share of the way to black or white at any size.
 */
export function filterPlan(filters: FilterSet, kind: BackgroundKind, size: PixelSize): FilterPlanStep[] {
  // What the background takes whatever the browser: a Paper filter is only
  // ever chosen where WebGL2 offered it.
  const offered = filtersFor(kind, true);
  const plan: FilterPlanStep[] = [];
  if (offered?.paper && filters.paper && filters.paperStrength > 0) {
    // One box per slide aspect, whatever the size: the preview and the 4K
    // result share one composition, as the recipe edit's do.
    const aspect = size.width / size.height;
    const box =
      aspect >= 1
        ? { cssWidth: Math.round(PAPER_BOX_SIDE * aspect), cssHeight: PAPER_BOX_SIDE }
        : { cssWidth: PAPER_BOX_SIDE, cssHeight: Math.round(PAPER_BOX_SIDE / aspect) };
    plan.push({ filter: "paper", paper: filters.paper, strength: filters.paperStrength, box, pixelRatio: size.width / box.cssWidth });
  }
  if (offered?.blur && filters.blur > 0) plan.push({ filter: "blur", radius: filters.blur * size.width });
  if (offered?.veil && filters.veil !== 0) plan.push({ filter: "veil", amount: filters.veil });
  if (offered?.grain && filters.grain > 0) {
    const exact = Math.max(size.width, size.height) / GRAIN_CELL_SIDE;
    // From 1 px up, cells are whole pixels: 1.33 px cells would alternate
    // between 1 and 2 px in a regular rhythm, a faint grid.
    const cell = exact >= 1 ? Math.round(exact) : exact;
    // Cells below a pixel cannot be drawn: each pixel stands for several, and
    // varies as their average would on a downscale of the larger picture,
    // whose spread shrinks with the cell's side.
    plan.push({ filter: "grain", amount: filters.grain * Math.min(1, exact), cell, seed: GRAIN_SEED });
  }
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
