// Pure batch-boundary logic for pdf-to-image streaming. No DOM/pdfjs — this is
// the testable model the render loop mirrors via shouldFlush(), so the loop and
// these tests can never disagree about where batch boundaries fall.

/**
 * Flush the current batch when its accumulated output bytes reach the target
 * AND there are still pages left to render. The "pages remain" guard means the
 * final partial batch is never split off prematurely: a job whose total only
 * reaches the target on its last page stays a single batch (= preview mode).
 */
export function shouldFlush(
  currentBytes: number,
  batchByteTarget: number,
  pagesRemaining: number,
): boolean {
  return currentBytes >= batchByteTarget && pagesRemaining > 0;
}

/**
 * Pure simulation of the render loop's batching over a known list of per-page
 * output byte sizes. Returns the page indices grouped per batch. A result with
 * one batch means "preview" (single zip / grid); more than one means "streamed".
 */
export function planBatches(pageBytes: number[], batchByteTarget: number): number[][] {
  const batches: number[][] = [];
  let current: number[] = [];
  let currentBytes = 0;

  for (let i = 0; i < pageBytes.length; i++) {
    current.push(i);
    currentBytes += pageBytes[i];
    const pagesRemaining = pageBytes.length - 1 - i;
    if (shouldFlush(currentBytes, batchByteTarget, pagesRemaining)) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
