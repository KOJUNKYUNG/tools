// Pure: turn the editor's page model into an ordered list of render jobs.
// No pdfjs/DOM here so it stays unit-testable.

import type { PageItem } from "./pageItem";

export interface ConversionJob {
  sourceFileId: string;
  /** Source file name — used to name the output image after its own PDF. */
  sourceFileName: string;
  sourcePageIndex: number;
  /** Clockwise rotation applied on render (0|90|180|270). */
  rotation: number;
}

/** Non-deleted pages, in order, as render jobs. */
export function buildConversionJobs(items: PageItem[]): ConversionJob[] {
  return items
    .filter((p) => !p.deleted)
    .map((p) => ({
      sourceFileId: p.sourceFileId,
      sourceFileName: p.sourceFileName,
      sourcePageIndex: p.sourcePageIndex,
      rotation: p.rotation,
    }));
}
