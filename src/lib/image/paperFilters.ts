/**
 * The filter set's Paper image filters (CONTEXT "Filter set"): which Paper
 * shader and preset each one draws, the values tuned over that preset, the
 * settings the user may change, and the props made to fill the slide. Pure:
 * the preset's props come from the gallery scripts' prop table
 * (scripts/gallery/paper-props.json), which the drawing loads on first use.
 */
import type { SliderRange } from "@/lib/gallery/recipeEdit";

/** A value a Paper filter is drawn with. */
export type PaperValue = number | string | boolean;

/** One setting of a Paper filter that the effects group offers. */
export type PaperSetting =
  | { kind: "number"; range: SliderRange; default: number }
  /** One of the shader's named options. */
  | { kind: "choice"; options: readonly string[]; default: string }
  | { kind: "colour"; default: string }
  | { kind: "toggle"; default: boolean }
  /** A whole number the user does not read, only changes: a button draws another. */
  | { kind: "pattern"; min: number; max: number; default: number };

/** A Paper filter's settings by prop; `hiddenWhen` hides one that another setting makes unused. */
type Settings = Record<string, PaperSetting & { hiddenWhen?: { setting: string; is: PaperValue } }>;

/** 0 to 1, read 0 to 100: Paper's sizes and amounts. */
const SHARE: SliderRange = { min: 0, max: 1, step: 0.01, shown: { times: 100 } };

/**
 * Each Paper filter: its shader's key in the prop table, the Paper preset it
 * is drawn at, the props tuned over that preset at the spec-end visual QA
 * (2026-10-31), and the settings offered, each defaulting to the value drawn.
 */
export const PAPER_FILTERS = {
  flutedGlass: {
    shader: "flutedGlass",
    preset: "Default",
    params: {},
    settings: {
      size: { kind: "number", range: SHARE, default: 0.5 },
      angle: { kind: "number", range: { min: 0, max: 180, step: 1, shown: { times: 1, suffix: "°" } }, default: 0 },
      shape: { kind: "choice", options: ["lines", "linesIrregular", "wave", "zigzag", "pattern"], default: "lines" },
    },
  },
  paperTexture: {
    shader: "paperTexture",
    preset: "Default",
    // A white sheet with grey crumples and no folds; no distortion, which drew
    // a band along the edges.
    params: {
      colorBack: "#ffffff",
      distortion: 0,
      angle: 0,
      roughness: 1,
      roughnessSize: 1,
      folds: 0,
      wrinkleSize: 0.6,
      crumples: 0.7,
      drops: 0.05,
    },
    settings: {
      colorShadow: { kind: "colour", default: "#9b9a92" },
      seed: { kind: "pattern", min: 1, max: 42, default: 4 },
    },
  },
  // One shader, two looks: dots in two colours, or in the picture's own.
  halftoneDuotone: {
    shader: "halftoneDots",
    preset: "Default",
    // The filter set's grain is the one grain.
    params: { grainMixer: 0, grainOverlay: 0 },
    settings: {
      size: { kind: "number", range: SHARE, default: 0.5 },
      // The dots' colour is unused while they take the picture's own.
      colorFront: { kind: "colour", default: "#2b2b2b", hiddenWhen: { setting: "originalColors", is: true } },
      colorBack: { kind: "colour", default: "#f2f1e8" },
      originalColors: { kind: "toggle", default: false },
    },
  },
  halftoneMosaic: {
    shader: "halftoneDots",
    preset: "Mosaic",
    params: {},
    settings: {
      size: { kind: "number", range: SHARE, default: 0.6 },
    },
  },
  halftoneCmyk: {
    shader: "halftoneCmyk",
    preset: "Vintage",
    // Vintage's sharp dots, softer, without its grain, and warmer.
    params: {
      softness: 0.65,
      grainSize: 0,
      grainMixer: 0,
      grainOverlay: 0,
      floodC: 0.25,
      floodM: 0.1,
      gainY: 0.3,
      gainK: -0.02,
    },
    settings: {
      size: { kind: "number", range: SHARE, default: 0.2 },
      contrast: { kind: "number", range: { min: 0, max: 2, step: 0.01, shown: { times: 100, suffix: "%" } }, default: 1 },
      gridNoise: { kind: "number", range: SHARE, default: 0.35 },
    },
  },
} as const satisfies Record<string, { shader: string; preset: string; params: Record<string, PaperValue>; settings: Settings }>;

/** One of the Paper filters, by the filter set's own name. */
export type PaperFilter = keyof typeof PAPER_FILTERS;

/** The Paper filters, in the order the effects group lists them. */
// Object.keys types its result as string[]; the keys are the table's own.
export const PAPER_FILTER_NAMES = Object.keys(PAPER_FILTERS) as PaperFilter[];

/** Whether `name` is one of the Paper filters. */
export function isPaperFilter(name: string): name is PaperFilter {
  return Object.hasOwn(PAPER_FILTERS, name);
}

/** The user's values of each Paper filter's settings, each filter's kept while another is chosen. */
export type PaperSettings = Partial<Record<PaperFilter, Record<string, PaperValue>>>;

/** `filter`'s settings, by prop. */
export function settingsOf(filter: PaperFilter): Settings {
  // The table's literal types narrowed to the shared shape.
  return PAPER_FILTERS[filter].settings as Settings;
}

/** `filter`'s settings at the user's values, or their defaults. */
export function settingValues(filter: PaperFilter, settings: PaperSettings): Record<string, PaperValue> {
  const chosen = settings[filter] ?? {};
  return Object.fromEntries(Object.entries(settingsOf(filter)).map(([prop, setting]) => [prop, chosen[prop] ?? setting.default]));
}

/** Whether `prop` of `filter` is shown at these values: not one another setting makes unused. */
export function settingShown(filter: PaperFilter, prop: string, values: Record<string, PaperValue>): boolean {
  const hidden = settingsOf(filter)[prop]?.hiddenWhen;
  return !hidden || values[hidden.setting] !== hidden.is;
}

/** The props `filter` is drawn with over its preset: the tuned values, then the settings. */
export function paperParams(filter: PaperFilter, settings: PaperSettings): Record<string, PaperValue> {
  return { ...PAPER_FILTERS[filter].params, ...settingValues(filter, settings) };
}

/** Another whole number of a pattern setting's range than `current`, from `random` (0 ≤ r < 1). */
export function nextPattern(setting: { min: number; max: number }, current: number, random: number): number {
  const count = setting.max - setting.min;
  // Every value but the current one, equally likely.
  const step = 1 + Math.floor(random * count);
  return setting.min + ((current - setting.min + step) % (count + 1));
}

/**
 * A preset's props made to fill the slide: drawn to cover it, never shrunk
 * below it. Some presets frame the picture smaller (paper texture's are
 * contain at 0.9), which on a background would leave an edge around it.
 */
export function fillingProps<P extends { fit?: unknown; scale?: unknown }>(params: P): P & { fit: "cover"; scale: number } {
  const scale = typeof params.scale === "number" ? params.scale : 1;
  return { ...params, fit: "cover", scale: Math.max(1, scale) };
}
