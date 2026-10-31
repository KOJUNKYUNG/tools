/**
 * The filter set (CONTEXT "Filter set"): which effects the edit area offers
 * for a background, how its state answers the tool's steps, whether it
 * changes the picture, and the steps it bakes into a picture of a given size.
 * Pure: the pixels are pixelFilters.ts's, the canvas the tool's.
 */
import type { SliderRange } from "@/lib/gallery/recipeEdit";
import { PAPER_FILTER_NAMES, paperParams, type PaperFilter, type PaperSettings, type PaperValue } from "./paperFilters";
import { contrast, overlay, saturate, veil, type Rgb } from "./pixelFilters";
import type { PixelSize } from "./slideImage";

/** What the user picked as the new background. */
export type BackgroundKind = "picture" | "solid" | "none";

/** What the user set on the effects group: strengths as shares of the picture, never pixels. */
export interface FilterSet {
  /** The blur's standard deviation, as a share of the picture's width. */
  blur: number;
  /** −1 (grey) to 1: how far colours move from their grey. */
  saturation: number;
  /** How far tones move from mid grey: below 0 fades, above 0 parts darks and lights. */
  contrast: number;
  /** The one Paper filter laid over the picture, or none. */
  paper: PaperFilter | null;
  /** The share of the Paper filter's drawing laid over the picture. */
  paperStrength: number;
  /** The user's values of the Paper filters' settings. */
  paperSettings: PaperSettings;
  /** The colour overlay's share, 0 to 1. */
  overlay: number;
  /** The colour overlay's colour, `#rrggbb`. */
  overlayColour: string;
  /** The veil: below 0 darkens, above 0 lightens, as a share of the way to black or white. */
  veil: number;
  /** The grain's largest change, as a share of full scale. */
  grain: number;
  /** The grain's specks, times the plain cell (1 px at Full HD). */
  grainSize: number;
  /** The share of colour in the grain, 0 (monochrome) to 1. */
  grainColour: number;
  /** Grain stronger in mid tones and fading towards black and white. */
  grainResponse: boolean;
}

/** The effects group's controls, each null where the background does not take it (hidden). */
export interface OfferedFilters {
  blur: SliderRange | null;
  saturation: SliderRange;
  contrast: SliderRange;
  /** The one-of choice of Paper filter ("none" besides these) and its strength; none without WebGL2. */
  paper: { filters: readonly PaperFilter[]; strength: SliderRange } | null;
  overlay: SliderRange;
  veil: SliderRange;
  grain: SliderRange;
  grainSize: SliderRange;
  grainColour: SliderRange;
}

// Ranges set at the spec-end visual QA (2026-10-31); saturation, contrast
// and the colour overlay [임시] until their own look.
/** 0 to 5% of the width; arrows step 0.1%, since 1% already blurs strongly. */
const BLUR: SliderRange = { min: 0, max: 0.05, step: 0.001, shown: { times: 100, suffix: "%" }, arrowStep: 0.1 };
/** −100% (grey) to +100%. */
const SATURATION: SliderRange = { min: -1, max: 1, step: 0.01, shown: { times: 100, suffix: "%" } };
/** −50% to +50%. */
const CONTRAST: SliderRange = { min: -0.5, max: 0.5, step: 0.01, shown: { times: 100, suffix: "%" } };
/** 0 to 60%. */
const OVERLAY: SliderRange = { min: 0, max: 0.6, step: 0.01, shown: { times: 100, suffix: "%" } };
/** −75% (dark) to +75% (light). */
const VEIL: SliderRange = { min: -0.75, max: 0.75, step: 0.01, shown: { times: 100, suffix: "%" } };
/** 0 to 0.5, read 0 to 50. */
const GRAIN: SliderRange = { min: 0, max: 0.5, step: 0.005, shown: { times: 100 } };
/** 0.5 to 3 times the plain cell. */
const GRAIN_SIZE: SliderRange = { min: 0.5, max: 3, step: 0.1, shown: { times: 1 } };
/** 0 to 100%. */
const GRAIN_COLOUR: SliderRange = { min: 0, max: 1, step: 0.05, shown: { times: 100, suffix: "%" } };
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
 * The Paper filters a solid colour takes: not the duotone halftone, which
 * redraws it in its own two colours, so the colour picked is lost.
 */
const SOLID_PAPER_FILTERS = PAPER_FILTER_NAMES.filter((filter) => filter !== "halftoneDuotone");

/**
 * The effects group for a background, or null where it has none ("no
 * background" is the theme's colour by definition). A solid colour takes
 * every effect but blur, which changes nothing on it; the colour effects
 * (saturation, contrast, the overlays) only change its colour, so it stays
 * a fill unless grain or a Paper filter makes it a picture.
 */
export function filtersFor(kind: BackgroundKind, webgl2: boolean): OfferedFilters | null {
  if (kind === "none") return null;
  const picture = kind === "picture";
  return {
    blur: picture ? BLUR : null,
    saturation: SATURATION,
    contrast: CONTRAST,
    // Paper's filters draw with WebGL2 only.
    paper: webgl2 ? { filters: picture ? PAPER_FILTER_NAMES : SOLID_PAPER_FILTERS, strength: STRENGTH } : null,
    overlay: OVERLAY,
    veil: VEIL,
    grain: GRAIN,
    grainSize: GRAIN_SIZE,
    grainColour: GRAIN_COLOUR,
  };
}

/**
 * No filter: the picture as it is; a Paper filter picked from here comes at
 * full strength, the overlay in its first colour, grain plain.
 */
export const NO_FILTERS: FilterSet = {
  blur: 0,
  saturation: 0,
  contrast: 0,
  paper: null,
  paperStrength: 1,
  paperSettings: {},
  overlay: 0,
  // [임시] until the visual QA: a deep blue, visible on light and dark pictures.
  overlayColour: "#1f3c88",
  veil: 0,
  grain: 0,
  grainSize: 1,
  grainColour: 0,
  grainResponse: false,
};

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
  /** `radius`: the Gaussian's standard deviation, in px. */
  | { filter: "blur"; radius: number }
  | { filter: "saturation"; amount: number }
  | { filter: "contrast"; amount: number }
  /**
   * `params`: the props drawn over the preset; `strength`: the share of the
   * drawing laid over the picture; `box`: the CSS size the drawing is laid
   * out at, which sets its composition; `pixelRatio`: the ratio at which
   * the box reaches the picture's pixels.
   */
  | {
      filter: "paper";
      paper: PaperFilter;
      params: Record<string, PaperValue>;
      strength: number;
      box: CssBox;
      pixelRatio: number;
    }
  | { filter: "overlay"; colour: Rgb; amount: number }
  | { filter: "veil"; amount: number }
  /**
   * `cell`: a grain cell's side, in px; `seed`: the pattern; `spread`: the
   * blur that grows its specks, in px; `colour` and `response` as set.
   */
  | { filter: "grain"; amount: number; cell: number; seed: number; spread: number; colour: number; response: boolean };

/** `#rrggbb` as RGB. */
function rgbOf(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The filters `filters` bakes into a `kind` background of `size` (the
 * fitted picture), in the fixed order (CONTEXT "Filter set"): the picture's
 * adjustments (blur, saturation, contrast), the Paper filter drawn from the
 * adjusted picture, the overlays (colour, then the veil) over everything,
 * and grain last. Only those the background takes, so a value hidden for a
 * solid colour is kept but not applied. Strengths held as shares of the
 * picture become pixel values for `size`, so every size of a picture looks
 * alike: the blur's radius is a share of the width, and grain cells are
 * 1 px at Full HD (by the long side, so a portrait slide's too), scaled
 * with the size, in one pattern.
 */
export function filterPlan(filters: FilterSet, kind: BackgroundKind, size: PixelSize): FilterPlanStep[] {
  // What the background takes whatever the browser: a Paper filter is only
  // ever chosen where WebGL2 offered it.
  const offered = filtersFor(kind, true);
  if (!offered) return [];
  const plan: FilterPlanStep[] = [];
  if (offered.blur && filters.blur > 0) plan.push({ filter: "blur", radius: filters.blur * size.width });
  if (filters.saturation !== 0) plan.push({ filter: "saturation", amount: filters.saturation });
  if (filters.contrast !== 0) plan.push({ filter: "contrast", amount: filters.contrast });
  if (filters.paper && offered.paper?.filters.includes(filters.paper) && filters.paperStrength > 0) {
    // One box per slide aspect, whatever the size: the preview and the 4K
    // result share one composition, as the recipe edit's do.
    const aspect = size.width / size.height;
    const box =
      aspect >= 1
        ? { cssWidth: Math.round(PAPER_BOX_SIDE * aspect), cssHeight: PAPER_BOX_SIDE }
        : { cssWidth: PAPER_BOX_SIDE, cssHeight: Math.round(PAPER_BOX_SIDE / aspect) };
    plan.push({
      filter: "paper",
      paper: filters.paper,
      params: paperParams(filters.paper, filters.paperSettings),
      strength: filters.paperStrength,
      box,
      pixelRatio: size.width / box.cssWidth,
    });
  }
  if (filters.overlay > 0) plan.push({ filter: "overlay", colour: rgbOf(filters.overlayColour), amount: filters.overlay });
  if (filters.veil !== 0) plan.push({ filter: "veil", amount: filters.veil });
  if (filters.grain > 0) {
    const exact = Math.max(size.width, size.height) / GRAIN_CELL_SIDE;
    // Below 1, smaller specks are smaller cells; above, the cells blur into larger specks.
    const speck = exact * Math.min(1, filters.grainSize);
    // From 1 px up, cells are whole pixels: 1.33 px cells would alternate
    // between 1 and 2 px in a regular rhythm, a faint grid.
    const cell = speck >= 1 ? Math.round(speck) : speck;
    plan.push({
      filter: "grain",
      // Cells below a pixel cannot be drawn: each pixel stands for several,
      // and varies as their average would on a downscale of the larger
      // picture, whose spread shrinks with the cell's side.
      amount: filters.grain * Math.min(1, speck),
      cell,
      seed: GRAIN_SEED,
      // A Gaussian that grows a cell's speck `grainSize` times as wide.
      spread: filters.grainSize > 1 ? 0.5 * cell * Math.sqrt(filters.grainSize ** 2 - 1) : 0,
      colour: filters.grainColour,
      response: filters.grainResponse,
    });
  }
  return plan;
}

/**
 * What a preview's Paper drawing depends on, or null when the plan lays
 * none: the filter, its props and the adjustments drawn under it, so a
 * drawing is kept across the strength, the overlays and grain.
 */
export function paperDrawingKey(filters: FilterSet, kind: BackgroundKind): string | null {
  // The steps are the same at every size; only their pixel values differ.
  const plan = filterPlan(filters, kind, { width: 1, height: 1 });
  const at = plan.findIndex((step) => step.filter === "paper");
  if (at < 0) return null;
  const { strength: _strength, ...paper } = plan[at] as Extract<FilterPlanStep, { filter: "paper" }>;
  return JSON.stringify([plan.slice(0, at), paper]);
}

/** A filter the plan lays, as the effects group's summary names it: the veil by its way, a Paper filter by name. */
export type ActiveFilter = "blur" | "saturation" | "contrast" | PaperFilter | "overlay" | "darken" | "lighten" | "grain";

/** The filters `filters` lays on a `kind` background, in the plan's order. */
export function activeFilters(filters: FilterSet, kind: BackgroundKind): ActiveFilter[] {
  return filterPlan(filters, kind, { width: 1, height: 1 }).map((step) => {
    if (step.filter === "paper") return step.paper;
    if (step.filter === "veil") return step.amount < 0 ? "darken" : "lighten";
    return step.filter;
  });
}

/** Whether `filters` changes a `kind` background at all: the effects group's reset has something to clear. */
export function isFiltered(filters: FilterSet, kind: BackgroundKind): boolean {
  return filterPlan(filters, kind, { width: 1, height: 1 }).length > 0;
}

/**
 * Whether `filters` makes a `kind` background a picture with the filters
 * baked in: the picture path runs the filter step, and a solid colour goes
 * in as a picture rather than a fill, which takes only grain or a Paper
 * filter; its colour effects only change the fill's colour.
 */
export function bakesPicture(filters: FilterSet, kind: BackgroundKind): boolean {
  const plan = filterPlan(filters, kind, { width: 1, height: 1 });
  return kind === "solid" ? plan.some((step) => step.filter === "paper" || step.filter === "grain") : plan.length > 0;
}

/**
 * A solid colour (`#rrggbb`) with the colour effects of `filters`, as its
 * fill: what the same steps give on its pixels, so a colour that becomes a
 * picture once grain is added does not change hue.
 */
export function filteredColour(filters: FilterSet, hex: string): string {
  const pixel = Uint8ClampedArray.from([...rgbOf(hex), 255]);
  for (const step of filterPlan(filters, "solid", { width: 1, height: 1 })) {
    if (step.filter === "saturation") saturate(pixel, step.amount);
    else if (step.filter === "contrast") contrast(pixel, step.amount);
    else if (step.filter === "overlay") overlay(pixel, step.colour, step.amount);
    else if (step.filter === "veil") veil(pixel, step.amount);
  }
  return `#${[pixel[0], pixel[1], pixel[2]].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
