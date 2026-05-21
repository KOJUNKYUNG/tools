export interface Savings {
  /** original - compressed, in bytes. Negative when the output grew. */
  saved: number;
  /** Percent of the original saved, rounded. 0 when original is 0. */
  pct: number;
}

/**
 * Compute how much a compression saved. Pure; reused by the live estimate
 * line and the done-mode file rows.
 */
export function computeSavings(
  originalBytes: number,
  compressedBytes: number,
): Savings {
  const saved = originalBytes - compressedBytes;
  const pct = originalBytes > 0 ? Math.round((saved / originalBytes) * 100) : 0;
  return { saved, pct };
}
