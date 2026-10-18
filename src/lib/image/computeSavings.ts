export interface Savings {
  /** original - compressed, in bytes. Negative when the output grew. */
  saved: number;
  /** Percent of the original saved, rounded. 0 when original is 0. */
  pct: number;
}

/**
 * Compute how much a compression saved. Pure; reused by the compressors'
 * result cards and image-compress's live estimate.
 */
export function computeSavings(
  originalBytes: number,
  compressedBytes: number,
): Savings {
  const saved = originalBytes - compressedBytes;
  const pct = originalBytes > 0 ? Math.round((saved / originalBytes) * 100) : 0;
  return { saved, pct };
}

/**
 * A saving as shown to the user. A file that shrank by less than 0.5% rounds
 * to 0%, which would read as "nothing saved" next to a download, so it shows
 * `underOnePct` ("under 1%") instead (#77). `signed` prefixes a saving with -
 * and growth with +, as image-compress's estimate does.
 */
export function savingsPctText(
  { saved, pct }: Savings,
  underOnePct: string,
  { signed = false }: { signed?: boolean } = {},
): string {
  if (saved > 0 && pct === 0) return underOnePct;
  if (!signed) return `${pct}%`;
  if (pct > 0) return `-${pct}%`;
  if (pct < 0) return `+${-pct}%`;
  return "±0%";
}
