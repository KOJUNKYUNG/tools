// Pure page-model logic for the unified PDF page editor (pdf-arrange).
// No pdfjs / pdf-lib here — this module is the in-memory representation of the
// editor's pages plus the rules that turn them into output sections. Keeping it
// dependency-free makes merge/split deterministic and unit-testable.

export type Rotation = 0 | 90 | 180 | 270;
export type PageKind = "pdf" | "image";

/** One page in the editor — a reference to a source page plus edit state. */
export interface PageItem {
  /** Stable id for React keys + dnd-kit. */
  id: string;
  /** Which uploaded file this page came from (cache key part). */
  sourceFileId: string;
  /** Original file name (used to derive the output base name). */
  sourceFileName: string;
  /** "pdf" pages reference a page index; "image" pages embed the whole file. */
  kind: PageKind;
  /** 0-based page index within the source pdf; 0 for images. */
  sourcePageIndex: number;
  /** Clockwise rotation applied on output (and as a CSS transform on thumbnails). */
  rotation: Rotation;
  /** When true, a section boundary follows this page. */
  splitAfter: boolean;
  /** Soft-deleted: excluded from output, kept so "다시 선택" can restore state. */
  deleted: boolean;
}

/**
 * Split the ordered page list into output sections.
 *
 * Rules:
 * - Deleted pages are dropped (and so is any divider they carry).
 * - A non-deleted page with `splitAfter` closes the current section.
 * - Empty sections are never emitted (e.g. a fully-deleted section, or a
 *   divider on the last page producing a trailing empty section).
 */
export function splitIntoSections(items: PageItem[]): PageItem[][] {
  const sections: PageItem[][] = [];
  let current: PageItem[] = [];

  for (const item of items) {
    if (item.deleted) continue;
    current.push(item);
    if (item.splitAfter) {
      sections.push(current);
      current = [];
    }
  }

  if (current.length > 0) sections.push(current);

  return sections;
}

/** Number of output files the current page list would produce. */
export function countSections(items: PageItem[]): number {
  return splitIntoSections(items).length;
}

export interface OutputNames {
  /** Name of the zip when multiple sections are produced. */
  zipName: string;
  /** Per-section file names, in order. */
  fileNames: string[];
}

/**
 * Derive output file names from a base (the first uploaded file name, sans ext).
 * - 1 section  → `{base}.pdf`
 * - N sections → `{base}-1.pdf` … `{base}-N.pdf`, packaged as `{base}-split.zip`
 */
export function buildOutputNames(base: string, n: number): OutputNames {
  const zipName = `${base}-split.zip`;

  if (n <= 1) {
    return { zipName, fileNames: [`${base}.pdf`] };
  }

  const fileNames = Array.from({ length: n }, (_, i) => `${base}-${i + 1}.pdf`);
  return { zipName, fileNames };
}
