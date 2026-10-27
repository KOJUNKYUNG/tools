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
}

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

export function controlsFor(recipe: PaperRecipe): RecipeControls {
  const paperMax = PAPER_MAX_COLOURS[recipe.shader];
  return {
    hue: { min: -180, max: 180, step: 1 },
    maxColours: Array.isArray(recipe.colors) && paperMax ? Math.min(paperMax, MAX_COLOURS) : null,
  };
}

/** An edit that starts from the recipe as it is. */
export function startEdit(_recipe: PaperRecipe): RecipeEdit {
  return { hueShift: 0, colours: {}, added: [] };
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

/** The props to draw: the recipe with the edit applied (the recipe itself when it draws the same). */
export function applyEdit(recipe: PaperRecipe, edit: RecipeEdit): PaperRecipe {
  const chips = colourChips(recipe, edit);
  const drawnOf = (prop: string) => chips.find((c) => c.id === prop)!.colour;
  const list = chips.filter((c) => c.id.startsWith("colors.")).map((c) => c.colour);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const unchanged =
    singleProps(recipe).every((prop) => same(drawnOf(prop), recipe[prop] as string)) &&
    list.length === recipeList(recipe).length &&
    list.every((c, i) => same(c, recipeList(recipe)[i]));
  if (unchanged) return recipe;
  const drawn: PaperRecipe = { ...recipe };
  for (const prop of singleProps(recipe)) drawn[prop] = drawnOf(prop);
  if (Array.isArray(recipe.colors)) drawn.colors = list;
  return drawn;
}
