// Sentinel error message that the React layer's error mapper detects to swap
// in a user-facing "compressed file is unusable" toast. Throwing keeps the
// existing useToolProcessor error flow intact.
export const CORRUPT_OUTPUT_MARKER = "CORRUPT_OUTPUT";

/**
 * Ratio below which we run a defensive page-count check. The reported
 * sample (3.2MB → 24KB ≈ 0.78%) is far below 5%, and the smallest
 * legitimate compression observed in fixtures was ~8% on a 163MB
 * image-heavy deck. 5% catches the bug case while leaving headroom.
 */
export const SUSPICIOUS_RATIO_THRESHOLD = 0.05;

/** Result of {@link assertCompressedPdfIntegrity}. */
export interface IntegrityCheckInput {
  data: Uint8Array;
  originalSize: number;
  compressedSize: number;
  sourcePageCount: number;
  /** Page count from running `analyze()` on the compressed output. */
  outputPageCount: number;
}

/**
 * Throws if the compressed bytes look corrupt.
 *
 * Trigger conditions, in order of cheapness:
 *  1. Empty or sub-header-sized output
 *  2. Output does not start with `%PDF`
 *  3. Page count dropped (analyze() reports fewer pages than the source)
 *  4. Output is < {@link SUSPICIOUS_RATIO_THRESHOLD} of the source AND
 *     the page count is suspiciously low (≤ 1 page from a multi-page source).
 *
 * (3) and (4) catch the upstream WASM silent-corruption pattern where
 * `compress_advanced` returns success with nearly-empty bytes.
 *
 * Always throws with a message starting with {@link CORRUPT_OUTPUT_MARKER}
 * so the React error mapper can swap in a localized toast.
 */
export function assertCompressedPdfIntegrity({
  data,
  originalSize,
  compressedSize,
  sourcePageCount,
  outputPageCount,
}: IntegrityCheckInput): void {
  if (compressedSize <= 4 || data.length <= 4) {
    throw new Error(`${CORRUPT_OUTPUT_MARKER}: empty output (${compressedSize} bytes)`);
  }

  if (
    data[0] !== 0x25 /* % */ ||
    data[1] !== 0x50 /* P */ ||
    data[2] !== 0x44 /* D */ ||
    data[3] !== 0x46 /* F */
  ) {
    throw new Error(`${CORRUPT_OUTPUT_MARKER}: missing %PDF header`);
  }

  if (sourcePageCount > 0 && outputPageCount < sourcePageCount) {
    throw new Error(
      `${CORRUPT_OUTPUT_MARKER}: page count dropped (${sourcePageCount} → ${outputPageCount})`,
    );
  }

  const ratio = originalSize > 0 ? compressedSize / originalSize : 1;
  if (
    ratio < SUSPICIOUS_RATIO_THRESHOLD &&
    sourcePageCount > 1 &&
    outputPageCount <= 1
  ) {
    throw new Error(
      `${CORRUPT_OUTPUT_MARKER}: suspicious ratio ${(ratio * 100).toFixed(2)}% with ${outputPageCount} page(s)`,
    );
  }
}
