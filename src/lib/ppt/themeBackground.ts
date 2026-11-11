import type { SlideBackground } from "./extractCurrentBackgrounds";
import { resolveFill, type Colours, type Swatch } from "./fills";
import { parseXml } from "./xmlTree";

/** "No background": the theme's background colour, as PowerPoint fills a blank slide. */
export const NO_BACKGROUND_FILL = '<a:solidFill><a:schemeClr val="bg1"/></a:solidFill>';

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
 * The colours the gallery's "no background" tile shows, so the user can
 * foresee what it turns the deck into: every distinct one, in slide order
 * (one on a deck whose slides all show the same, one per master on a deck
 * whose masters differ); none when no slide's resolves.
 */
export function noBackgroundColours(bgs: readonly SlideBackground[]): `#${string}`[] {
  return [...new Set(bgs.map((b) => b.noBackground).filter((s) => s !== "fill"))];
}
