import { turnHue } from "./oklch";
import type { PaperRecipe } from "./recipes";

/** A colour the user picked for a chip, and the hue shift it was picked at. */
export interface PickedColour {
  /** `#rrggbb`, or `#rrggbbaa` keeping the recipe colour's own transparency. */
  hex: string;
  /** The hue shift it was picked at: drawn as picked there, turned by the difference elsewhere. */
  atShift: number;
}

/** What the user changed on a gallery recipe (CONTEXT "Recipe edit"). */
export interface RecipeEdit {
  /** Degrees every colour's OKLCH hue turns by. */
  hueShift: number;
  /** Recipe colours the user changed, by chip id. */
  colours: Record<string, PickedColour>;
  /** Colours added after the recipe's `colors` list, in order. */
  added: PickedColour[];
  /** Times the recipe's `scale`. */
  size: number;
  /** The grain props' value (ignored where the shader has no grain slider). */
  grain: number;
  /** The softness prop's value (ignored where the shader has no softness slider). */
  softness: number;
}

/** The edit's sliders besides the colour family, in the order the edit area shows them. */
export const SLIDERS = ["size", "grain", "softness"] as const;
export type Slider = (typeof SLIDERS)[number];

/** A slider's range, in the unit its edit value holds. */
export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

/** What the edit area offers for a recipe. */
export interface RecipeControls {
  /** The colour-family slider: degrees of hue turn, on every recipe. */
  hue: SliderRange;
  /** How many colours the `colors` list may hold; null where the shader has no list (no "+"). */
  maxColours: number | null;
  /** Times the recipe's `scale`, on every recipe of a known shader. */
  size: SliderRange | null;
  /** The shader's own grain; null where it has none (the slider is hidden). */
  grain: SliderRange | null;
  /** The shader's own softness; null where it has none (the slider is hidden). */
  softness: SliderRange | null;
}

/** One colour of the recipe as the edit area shows it. */
export interface ColourChip {
  /** The colour's prop (`colorBack`), or `colors.<i>` for an item of the list. */
  id: string;
  /** The colour drawn, hue shift included. */
  colour: string;
  /** Added by the user, so it may be removed; the recipe's own colours may not. */
  added: boolean;
}

/** Chips in one row of the edit area: no colour list grows past this. */
const MAX_COLOURS = 6;

/**
 * Paper's maximum length of each shader's `colors` list (its shader
 * definition's `maxColorCount`; the gallery catalog test holds this to
 * paper-props.json). A shader without a list has no entry.
 */
const PAPER_MAX_COLOURS: Record<string, number> = {
  meshGradient: 10,
  staticMeshGradient: 10,
  staticRadialGradient: 10,
  godRays: 5,
  warp: 10,
  grainGradient: 7,
  voronoi: 5,
  dotOrbit: 10,
  simplexNoise: 10,
  smokeRing: 10,
  swirl: 10,
};

/** The props a shader's grain and softness sliders write. */
interface ShaderSliders {
  /** Moved together by the one grain slider; empty where the shader has no grain. */
  grain: string[];
  /** `softness`, or `mixing` where the shader has that instead; null where it has neither. */
  softness: string | null;
}

/**
 * Each gallery shader's grain and softness props (CONTEXT "Recipe edit"), all
 * on Paper's 0 to 1 range. Deliberately left out: perlin `octaveCount`, smoke
 * ring `noiseScale`, voronoi `glow` (detail, shape and glow, not grain or
 * softness). The gallery catalog test holds every recipe's shader to an entry
 * here and every prop to paper-props.json.
 */
const SHADER_SLIDERS: Record<string, ShaderSliders> = {
  meshGradient: { grain: ["grainMixer", "grainOverlay"], softness: null },
  staticMeshGradient: { grain: ["grainMixer", "grainOverlay"], softness: "mixing" },
  staticRadialGradient: { grain: ["grainMixer", "grainOverlay"], softness: "mixing" },
  grainGradient: { grain: ["noise"], softness: "softness" },
  spiral: { grain: ["noise"], softness: "softness" },
  swirl: { grain: ["noise"], softness: "softness" },
  warp: { grain: [], softness: "softness" },
  waves: { grain: [], softness: "softness" },
  perlinNoise: { grain: [], softness: "softness" },
  simplexNoise: { grain: [], softness: "softness" },
  godRays: { grain: [], softness: null },
  dithering: { grain: [], softness: null },
  dotGrid: { grain: [], softness: null },
  dotOrbit: { grain: [], softness: null },
  voronoi: { grain: [], softness: null },
  smokeRing: { grain: [], softness: null },
};

const SIZE: SliderRange = { min: 0.5, max: 2, step: 0.05 };
// Fine enough for every recipe's own value to sit on a step (mixing 0.775).
const UNIT: SliderRange = { min: 0, max: 1, step: 0.005 };

/** The props `recipe`'s sliders write; null for a shader without an entry (no sliders). */
function slidersOf(recipe: PaperRecipe): ShaderSliders | null {
  return SHADER_SLIDERS[recipe.shader] ?? null;
}

export function controlsFor(recipe: PaperRecipe): RecipeControls {
  const paperMax = PAPER_MAX_COLOURS[recipe.shader];
  const sliders = slidersOf(recipe);
  return {
    hue: { min: -180, max: 180, step: 1 },
    maxColours: Array.isArray(recipe.colors) && paperMax ? Math.min(paperMax, MAX_COLOURS) : null,
    size: sliders ? SIZE : null,
    grain: sliders?.grain.length ? UNIT : null,
    softness: sliders?.softness ? UNIT : null,
  };
}

// Slider props hold numbers (the gallery catalog test holds every recipe to
// having each one, as a number of Paper's prop table).
const numberProp = (recipe: PaperRecipe, prop: string | undefined | null): number =>
  prop ? ((recipe[prop] as number | undefined) ?? 0) : 0;

/** An edit that starts from the recipe as it is: every slider at the recipe's own value. */
export function startEdit(recipe: PaperRecipe): RecipeEdit {
  const sliders = slidersOf(recipe);
  return {
    hueShift: 0,
    colours: {},
    added: [],
    size: 1,
    grain: numberProp(recipe, sliders?.grain[0]),
    softness: numberProp(recipe, sliders?.softness),
  };
}

/**
 * Whether `prop` holds the recipe's colours: Paper names them `colors` (a
 * list) and `color…` (one each: back, front, glow…). The gallery catalog test
 * holds this to Paper's own prop table.
 */
export function isColourProp(prop: string): boolean {
  return prop === "colors" || /^color[A-Z]/.test(prop);
}

// Recipe props are `unknown` (any React prop); colour props hold a hex string
// or a list of them (the gallery catalog test reads each one).
const recipeList = (recipe: PaperRecipe): string[] => (Array.isArray(recipe.colors) ? (recipe.colors as string[]) : []);
const singleProps = (recipe: PaperRecipe): string[] =>
  Object.keys(recipe).filter((prop) => prop !== "colors" && isColourProp(prop));

/** `picked` as drawn under the edit's hue shift. */
function drawnColour(picked: PickedColour, hueShift: number): string {
  const turn = (hueShift - picked.atShift) % 360;
  return turn === 0 ? picked.hex : turnHue(picked.hex, turn);
}

/** Each chip's colour before the hue shift: the recipe's own (picked at shift 0) or the user's. */
function pickedColours(recipe: PaperRecipe, edit: RecipeEdit): { id: string; picked: PickedColour; added: boolean }[] {
  const recipeChip = (id: string, hex: string) => ({ id, picked: edit.colours[id] ?? { hex, atShift: 0 }, added: false });
  const list = recipeList(recipe);
  return [
    ...singleProps(recipe).map((prop) => recipeChip(prop, recipe[prop] as string)),
    ...list.map((hex, i) => recipeChip(`colors.${i}`, hex)),
    ...edit.added.map((picked, i) => ({ id: `colors.${list.length + i}`, picked, added: true })),
  ];
}

/** Every colour of the recipe and the edit's added ones, as drawn: single colours, then the list. */
export function colourChips(recipe: PaperRecipe, edit: RecipeEdit): ColourChip[] {
  return pickedColours(recipe, edit).map(({ id, picked, added }) => ({
    id,
    colour: drawnColour(picked, edit.hueShift),
    added,
  }));
}

/**
 * `edit` with chip `id` set to `hex` (`#rrggbb`, the colour picker's value),
 * drawn as picked under the current hue shift and turned by later shifts. The
 * chip's own transparency stays: the picker has no alpha.
 */
export function setColour(recipe: PaperRecipe, edit: RecipeEdit, id: string, hex: string): RecipeEdit {
  const chip = pickedColours(recipe, edit).find((c) => c.id === id);
  if (!chip) return edit;
  const picked = { hex: `${hex.slice(0, 7).toLowerCase()}${chip.picked.hex.slice(7)}`, atShift: edit.hueShift };
  if (!chip.added) return { ...edit, colours: { ...edit.colours, [id]: picked } };
  const index = addedIndex(recipe, id);
  return { ...edit, added: edit.added.map((c, i) => (i === index ? picked : c)) };
}

/** Where chip `id` sits in the edit's added colours (meaningful for an added chip only). */
const addedIndex = (recipe: PaperRecipe, id: string) => Number(id.slice("colors.".length)) - recipeList(recipe).length;

/** Whether the edit area offers "+": the colour list is below its maximum. */
export function canAddColour(recipe: PaperRecipe, edit: RecipeEdit): boolean {
  const max = controlsFor(recipe).maxColours;
  return max !== null && recipeList(recipe).length + edit.added.length < max;
}

/**
 * `edit` with a colour appended to the list, starting as its last colour drawn
 * (where the colour picker then opens) but opaque, since the picker cannot
 * change transparency; `edit` itself when the list is full.
 */
export function addColour(recipe: PaperRecipe, edit: RecipeEdit): RecipeEdit {
  if (!canAddColour(recipe, edit)) return edit;
  // The list comes last among the chips, and a list is never empty.
  const last = colourChips(recipe, edit).at(-1)!;
  return { ...edit, added: [...edit.added, { hex: last.colour.slice(0, 7), atShift: edit.hueShift }] };
}

/** `edit` without the added colour `id`; the recipe's own colours stay (`edit` itself). */
export function removeColour(recipe: PaperRecipe, edit: RecipeEdit, id: string): RecipeEdit {
  if (!pickedColours(recipe, edit).some((c) => c.id === id && c.added)) return edit;
  const index = addedIndex(recipe, id);
  return { ...edit, added: edit.added.filter((_, i) => i !== index) };
}

/**
 * Whether `edit` changes what the recipe draws. An unedited pick applies the
 * gallery file itself, never a fresh drawing (CONTEXT "Recipe edit").
 */
export function isEdited(recipe: PaperRecipe, edit: RecipeEdit): boolean {
  return applyEdit(recipe, edit) !== recipe;
}

/** The slider props `edit` draws, by prop: only those of sliders the shader has. */
function sliderValues(recipe: PaperRecipe, edit: RecipeEdit): Record<string, number> {
  const sliders = slidersOf(recipe);
  if (!sliders) return {};
  const values: Record<string, number> = { scale: numberProp(recipe, "scale") * edit.size };
  for (const prop of sliders.grain) values[prop] = edit.grain;
  if (sliders.softness) values[sliders.softness] = edit.softness;
  return values;
}

/** The props to draw: the recipe with the edit applied (the recipe itself when it draws the same). */
export function applyEdit(recipe: PaperRecipe, edit: RecipeEdit): PaperRecipe {
  const chips = colourChips(recipe, edit);
  const drawnOf = (prop: string) => chips.find((c) => c.id === prop)!.colour;
  const list = chips.filter((c) => c.id.startsWith("colors.")).map((c) => c.colour);
  const values = sliderValues(recipe, edit);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const unchanged =
    singleProps(recipe).every((prop) => same(drawnOf(prop), recipe[prop] as string)) &&
    list.length === recipeList(recipe).length &&
    list.every((c, i) => same(c, recipeList(recipe)[i])) &&
    Object.entries(values).every(([prop, value]) => value === numberProp(recipe, prop));
  if (unchanged) return recipe;
  const drawn: PaperRecipe = { ...recipe, ...values };
  for (const prop of singleProps(recipe)) drawn[prop] = drawnOf(prop);
  if (Array.isArray(recipe.colors)) drawn.colors = list;
  return drawn;
}
