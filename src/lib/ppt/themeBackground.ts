import { NO_BACKGROUND_FILL } from "./changeBackground";
import type { SlideBackground } from "./extractCurrentBackgrounds";
import { resolveFill, type Colours, type Swatch } from "./fills";
import { parseXml } from "./xmlTree";

const NO_BACKGROUND = parseXml(NO_BACKGROUND_FILL) ?? undefined;

/**
 * The colour "no background" shows on a slide with these colours (its
 * master's theme `bg1` under its colour map), for the preview; `"fill"` when
 * it cannot be resolved.
 */
export function noBackgroundSwatch(colours: Colours): Swatch {
  return resolveFill(NO_BACKGROUND, colours)?.swatch ?? "fill";
}

/**
 * The colours the gallery's "no background" tile shows: the first two
 * distinct ones in slide order, one on a deck whose slides all show the same,
 * none when no slide's resolves.
 */
export function noBackgroundColours(bgs: readonly SlideBackground[]): [] | [`#${string}`] | [`#${string}`, `#${string}`] {
  const [first, second] = [...new Set(bgs.map((b) => b.noBackground).filter((s) => s !== "fill"))];
  return first === undefined ? [] : second === undefined ? [first] : [first, second];
}
