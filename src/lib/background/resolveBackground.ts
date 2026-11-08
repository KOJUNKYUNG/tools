import type { PaperRecipe } from "@/lib/gallery/recipes";
import { bakesPicture, filteredColour, type FilterSet } from "@/lib/image/filterSet";
import type { CropRect } from "@/lib/image/maxFitCrop";
import type { PrepareStep } from "@/lib/image/slideImage";
import type { FillBackground } from "@/lib/ppt/changeBackground";

/** The background as the user left it in the shared background editor. */
export interface BackgroundChoice {
  /** A picked solid colour or "no background", in place of a picture. */
  fill: FillBackground | null;
  /** The picked picture: a gallery file or an upload. */
  file: File | null;
  /** The Background crop set on `file`; centred when absent. */
  crop: CropRect | null;
  /** What an edited gallery recipe draws; null when the gallery file itself applies. */
  edited: PaperRecipe | null;
  filters: FilterSet;
}

/** How the tool draws what a run needs; the browser's canvas and Paper, stood in by tests. */
export interface BackgroundDrawing {
  /** The edited recipe, drawn at the gallery file's size. */
  drawEdited(props: PaperRecipe): Promise<File>;
  /** A solid colour (`rrggbb`) as a picture of the slide's shape. */
  solidPicture(rgb: string): Promise<File>;
  /** The filter set as the preparation step for a picture or a solid colour's picture; none when it changes nothing. */
  step(kind: "picture" | "solid"): PrepareStep | undefined;
}

/** A picture background as an engine takes it: the file, its crop (centred when absent) and preparation step. */
export interface RunPicture {
  kind: "picture";
  file: File;
  crop?: CropRect;
  step?: PrepareStep;
}

/** The background an engine takes: a fill, or a picture. */
export type RunBackground = { kind: "fill"; fill: FillBackground } | RunPicture;

/**
 * The background a run puts in its deck, resolved before the engine runs, the
 * same in every tool that mounts the shared background editor: an edited
 * recipe is drawn to a file at the gallery file's size (so the crop set on the
 * file applies to it as is); a solid colour whose filters need a picture
 * (grain, a Paper filter) becomes a picture of the colour, and otherwise
 * stays a fill of the colour its colour effects make; the filters become the
 * preparation step. A failed drawing rejects: the unedited file never stands
 * in for the edit.
 */
export async function resolveBackground(choice: BackgroundChoice, drawing: BackgroundDrawing): Promise<RunBackground> {
  const { fill, file, crop, edited, filters } = choice;
  if (fill?.kind === "colour") {
    if (bakesPicture(filters, "solid")) {
      return withStep({ kind: "picture", file: await drawing.solidPicture(fill.rgb) }, drawing.step("solid"));
    }
    return { kind: "fill", fill: { ...fill, rgb: filteredColour(filters, `#${fill.rgb}`).slice(1).toUpperCase() } };
  }
  // "No background" is the theme's colour by definition: no effects.
  if (fill) return { kind: "fill", fill };
  if (!file) throw new Error("resolveBackground: no background picked");
  const picture = edited ? await drawing.drawEdited(edited) : file;
  return withStep({ kind: "picture", file: picture, ...(crop ? { crop } : {}) }, drawing.step("picture"));
}

function withStep(picture: RunPicture, step: PrepareStep | undefined): RunPicture {
  return step ? { ...picture, step } : picture;
}
