import { turnHue } from "./oklch";
import type { PaperRecipe } from "./recipes";

/** What the user changed on a gallery recipe (CONTEXT "Recipe edit"). */
export interface RecipeEdit {
  /** Degrees every colour's OKLCH hue turns by. */
  hueShift: number;
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
}

export function controlsFor(_recipe: PaperRecipe): RecipeControls {
  return { hue: { min: -180, max: 180, step: 1 } };
}

/** An edit that starts from the recipe as it is. */
export function startEdit(_recipe: PaperRecipe): RecipeEdit {
  return { hueShift: 0 };
}

/**
 * Whether `prop` holds the recipe's colours: Paper names them `colors` (a
 * list) and `color…` (one each: back, front, glow…). The gallery catalog test
 * holds this to Paper's own prop table.
 */
export function isColourProp(prop: string): boolean {
  return prop === "colors" || /^color[A-Z]/.test(prop);
}

/**
 * Whether `edit` changes what the recipe draws. An unedited pick applies the
 * gallery file itself, never a fresh drawing (CONTEXT "Recipe edit").
 */
export function isEdited(recipe: PaperRecipe, edit: RecipeEdit): boolean {
  return applyEdit(recipe, edit) !== recipe;
}

/** The props to draw: the recipe with the edit applied (the recipe itself when unedited). */
export function applyEdit(recipe: PaperRecipe, edit: RecipeEdit): PaperRecipe {
  const turn = edit.hueShift % 360;
  if (turn === 0) return recipe;
  const drawn: PaperRecipe = { ...recipe };
  for (const [prop, value] of Object.entries(recipe)) {
    if (!isColourProp(prop)) continue;
    if (typeof value === "string") drawn[prop] = turnHue(value, turn);
    else if (Array.isArray(value)) drawn[prop] = value.map((c: string) => turnHue(c, turn));
  }
  return drawn;
}
