// Pure output-filename rules for pdf-to-image. No DOM/pdfjs — unit-testable.

/** Source base name = file name without its extension; "output" as a fallback. */
function stripExt(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  return base || "output";
}

/**
 * Name every converted image after the PDF it came from, numbered within that
 * source: `{sourceBase}-{NN}.{ext}`. The number restarts per source file and is
 * zero-padded to that source's own page count width (so page 2 sorts before 10).
 * Jobs are processed in order; counters are kept per `sourceFileId`.
 */
export function assignImageNames(
  jobs: { sourceFileId: string; sourceFileName: string }[],
  ext: string,
): string[] {
  const totals = new Map<string, number>();
  for (const j of jobs) {
    totals.set(j.sourceFileId, (totals.get(j.sourceFileId) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  return jobs.map((j) => {
    const n = (seen.get(j.sourceFileId) ?? 0) + 1;
    seen.set(j.sourceFileId, n);
    const width = String(totals.get(j.sourceFileId) ?? 1).length;
    return `${stripExt(j.sourceFileName)}-${String(n).padStart(width, "0")}.${ext}`;
  });
}

/** Zip name when multiple images are produced. */
export function deriveZipName(base: string): string {
  return `${base}-images.zip`;
}

/** Zip name for batch N when output is streamed in multiple archives. */
export function deriveBatchZipName(base: string, index: number): string {
  return `${base}-images-${index}.zip`;
}
