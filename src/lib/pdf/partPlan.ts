// Pure part-boundary logic for pdf-to-image. No DOM/pdfjs — this is
// the testable model the render loop mirrors via shouldClosePart(), so the loop and
// these tests can never disagree about where part boundaries fall.

/**
 * Close the current part when its accumulated output bytes reach the target
 * AND there are still pages left to render. The "pages remain" guard means the
 * last part is never empty: a job whose total only reaches the target on its
 * last page stays a single part (= preview mode).
 */
export function shouldClosePart(
  currentBytes: number,
  partByteTarget: number,
  pagesRemaining: number,
): boolean {
  return currentBytes >= partByteTarget && pagesRemaining > 0;
}

/**
 * Pure simulation of the render loop's cuts over a known list of per-page
 * output byte sizes. Returns the page indices grouped per part. A result with
 * one part means "preview" (single zip / grid); more than one means "parts".
 */
export function planParts(pageBytes: number[], partByteTarget: number): number[][] {
  const parts: number[][] = [];
  let current: number[] = [];
  let currentBytes = 0;

  for (let i = 0; i < pageBytes.length; i++) {
    current.push(i);
    currentBytes += pageBytes[i];
    const pagesRemaining = pageBytes.length - 1 - i;
    if (shouldClosePart(currentBytes, partByteTarget, pagesRemaining)) {
      parts.push(current);
      current = [];
      currentBytes = 0;
    }
  }
  if (current.length > 0) parts.push(current);
  return parts;
}
