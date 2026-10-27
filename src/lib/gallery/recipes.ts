import recipes from "../../../scripts/gallery/shaders.json";

/**
 * A gallery item's Paper Shaders recipe, as `scripts/gallery/shaders.json`
 * holds it (the one source the gallery build and the app both read): the
 * shader's key in `paper-props.json`, the animation frame it is drawn at, and
 * the React component's props, drawn on the 1280 × 720 CSS composition.
 */
export interface PaperRecipe {
  name: string;
  category?: string;
  shader: string;
  frame: number;
  [prop: string]: unknown;
}

// JSON imports are typed by their literal shape; every recipe has the fields
// PaperRecipe names (the gallery catalog test reads each one).
const BY_NAME = new Map((recipes as PaperRecipe[]).map((r) => [r.name, r]));

/** The recipe a Paper gallery item (catalog `source.kind` "paper") was drawn from. */
export function paperRecipe(name: string): PaperRecipe | null {
  return BY_NAME.get(name) ?? null;
}
