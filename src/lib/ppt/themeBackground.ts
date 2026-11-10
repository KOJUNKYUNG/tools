import JSZip from "jszip";
import { NO_BACKGROUND_FILL } from "./changeBackground";
import { resolveFill, type Swatch } from "./fills";
import { slideColours, zipPartReader } from "./slideColours";
import { parseXml } from "./xmlTree";
import { slidesInOrder } from "./zipSlides";

const NO_BACKGROUND = parseXml(NO_BACKGROUND_FILL) ?? undefined;

/**
 * The colour "no background" shows on the deck's first slide in presentation
 * order (its theme's `bg1` under the slide's colour map), for the preview;
 * `"fill"` when it cannot be resolved.
 */
export async function themeBackground(file: File): Promise<Swatch> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const [first] = await slidesInOrder(zip);
  if (!first) return "fill";
  const slideXml = await zip.file(first)?.async("text");
  if (!slideXml) return "fill";
  const colours = await slideColours(zipPartReader(zip))(first, slideXml);
  return resolveFill(NO_BACKGROUND, colours)?.swatch ?? "fill";
}
