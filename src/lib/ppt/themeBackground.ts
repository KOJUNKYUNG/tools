import JSZip from "jszip";
import { resolveFill, type Swatch } from "./fills";
import { slideColours, zipPartReader } from "./slideColours";
import { parseXml } from "./xmlTree";

/** What "no background" writes: the theme's background colour. */
const BG1 = parseXml('<a:solidFill><a:schemeClr val="bg1"/></a:solidFill>') ?? undefined;

/**
 * The colour "no background" shows on the deck's first slide (its theme's
 * `bg1` under the slide's colour map), for the preview; `"fill"` when it
 * cannot be resolved.
 */
export async function themeBackground(file: File): Promise<Swatch> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const first = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]))[0];
  if (!first) return "fill";
  const colours = await slideColours(zipPartReader(zip))(first, await zip.file(first)!.async("text"));
  return resolveFill(BG1, colours)?.swatch ?? "fill";
}
