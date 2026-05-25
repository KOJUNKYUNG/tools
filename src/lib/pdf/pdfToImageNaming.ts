// Pure output-filename rules for pdf-to-image. No DOM/pdfjs — unit-testable.

/**
 * Per-image output name: `{base}-{NN}.{ext}`, the 1-based `index` zero-padded to
 * the digit width of `total` so files sort naturally (page 2 before page 10).
 */
export function deriveImageName(
  base: string,
  index: number,
  total: number,
  ext: string,
): string {
  const width = String(Math.max(1, total)).length;
  const num = String(index).padStart(width, "0");
  return `${base}-${num}.${ext}`;
}

/** Zip name when multiple images are produced. */
export function deriveZipName(base: string): string {
  return `${base}-images.zip`;
}
