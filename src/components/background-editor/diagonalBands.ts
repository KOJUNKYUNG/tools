/**
 * Equal diagonal bands, one per colour, lower left first, as a CSS
 * background; one colour fills it. "No background" draws a deck's (or a
 * group's) theme colours this way, so the gallery tile and the preview agree.
 * Bands run parallel to the tile's "no fill" slash; two meet on it.
 */
export function diagonalBands(colours: readonly string[]): string {
  if (colours.length < 2) return colours[0];
  const stop = (i: number) => `${((i / colours.length) * 100).toFixed(3)}%`;
  return `linear-gradient(to top right, ${colours.map((c, i) => `${c} ${stop(i)} ${stop(i + 1)}`).join(", ")})`;
}
