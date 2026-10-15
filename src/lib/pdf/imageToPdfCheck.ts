import type { OutputChecker, Violation } from "@/lib/output-check/core";
import { type ImageHeader, readImageHeader } from "@/lib/output-check/imageHeader";
import { inspectPdf, type PdfReport } from "@/lib/output-check/pdfInspector";
import type { ImageLayout } from "./assembleSections";
import type { PageItem } from "./pageItem";

/** Raw bytes per source image id (PNG or JPEG). */
export type ImageToPdfSources = Map<string, Uint8Array>;

export interface ImageToPdfRequest {
  /** The images the user kept, in order: one page each. */
  pages: PageItem[];
  imageLayout: ImageLayout;
}

const normalise = (deg: number) => ((deg % 360) + 360) % 360;

// Image sizes come from the shared header inspector, not the engine's own
// format sniffing, on purpose: a checker that shared the engine's code would
// agree with its bugs.

/**
 * A source image's header. Throws when the image is missing or unreadable:
 * the engine embedded it, so either the request names an image it was not
 * given or the header reader has a gap. Neither is the output's fault, and
 * skipping would let the size checks pass without checking anything.
 */
function headerOf(sources: ImageToPdfSources, id: string): ImageHeader {
  const bytes = sources.get(id);
  if (!bytes) throw new Error(`no source bytes for ${id}`);
  const header = readImageHeader(bytes);
  if (!header) throw new Error(`cannot read the image header of ${id}`);
  return header;
}

/**
 * The page box and turn the layout calls for. Native: the image's size in
 * points as the user sees it (EXIF orientations 5–8 swap the stored sides),
 * turned by /Rotate. Fixed: the chosen size, upright, because the engine
 * draws the turn into the page.
 */
function expectedPage(
  layout: ImageLayout,
  item: PageItem,
  sources: ImageToPdfSources,
): { width: number; height: number; rotation: number } {
  if (layout.mode === "fixed") {
    return { width: layout.widthPt, height: layout.heightPt, rotation: 0 };
  }
  const { width, height, orientation } = headerOf(sources, item.sourceFileId);
  const quarterTurned = orientation >= 5;
  return {
    width: quarterTurned ? height : width,
    height: quarterTurned ? width : height,
    rotation: item.rotation,
  };
}

async function checkPages(
  pdf: PdfReport,
  sources: ImageToPdfSources,
  { pages, imageLayout }: ImageToPdfRequest,
): Promise<Violation[]> {
  const violations: Violation[] = [];
  const count = Math.min(pages.length, pdf.pageCount);
  for (let j = 0; j < count; j++) {
    const n = j + 1;
    const loadError = await pdf.loadError(n);
    if (loadError !== null) {
      violations.push({ property: "page-image", detail: `page ${n}: does not load: ${loadError}` });
      continue;
    }
    if (!(await pdf.drawsImage(n))) {
      violations.push({ property: "page-image", detail: `page ${n}: shows no image` });
    }

    const expected = expectedPage(imageLayout, pages[j], sources);
    const out = await pdf.page(n);
    if (Math.abs(out.width - expected.width) >= 0.01 || Math.abs(out.height - expected.height) >= 0.01) {
      violations.push({
        property: "page-size",
        detail: `page ${n}: ${out.width}×${out.height} pt, expected ${expected.width}×${expected.height}`,
      });
    }
    if (normalise(out.rotation) !== normalise(expected.rotation)) {
      violations.push({
        property: "page-rotation",
        detail: `page ${n}: expected ${normalise(expected.rotation)}°, got ${normalise(out.rotation)}°`,
      });
    }
  }
  return violations;
}

/**
 * The size bound: the PDF holds its images plus a little structure per page.
 * A JPEG is embedded as-is. A PNG is decoded and its pixels re-deflated
 * without PNG's filters, which can come out larger than the file, so it is
 * allowed its raw size (8-bit RGB plus alpha): deflate never exceeds that
 * by more than the margin.
 */
function sizeBound(sources: ImageToPdfSources, pages: PageItem[]): number {
  let images = 0;
  for (const id of new Set(pages.map((p) => p.sourceFileId))) {
    const header = headerOf(sources, id);
    images +=
      header.format === "png"
        ? header.width * header.height * 4
        : // Non-null: headerOf found the bytes.
          sources.get(id)!.byteLength;
  }
  return images + images / 50 + 4096 + 1024 * pages.length;
}

/**
 * image-to-pdf output properties (spec #51), checked with pdfjs: pdf-lib
 * wrote the PDF, so this is a cross-engine check. ⚡ = also at `quick`.
 *
 * - ⚡ `pdf-opens`: the PDF opens in pdfjs without a password
 * - ⚡ `first-page-renders`: page 1 renders. `quick` only loads it: rendering
 *   decodes the image, which for a large camera JPEG (embedded as-is, so
 *   processing is near-instant) costs ~100× the processing time and the
 *   image's full pixel memory, while pdfjs reports a failed decode as a
 *   warning, not an error. `full` renders it
 * - ⚡ `page-count`: one page per image the user kept
 * - `page-image`: every page shows an image
 * - `page-size` / `page-rotation`: each page follows the layout. Native: the
 *   image's size as displayed (EXIF orientation applied), turned as
 *   requested. Fixed: the chosen size, upright
 * - `size-bound`: the PDF ≤ its images + a margin
 */
export const checkImageToPdf: OutputChecker<
  ImageToPdfSources,
  ImageToPdfRequest,
  Uint8Array
> = async (sources, request, output, depth) => {
  const violations: Violation[] = [];

  if (depth === "full") {
    const bound = sizeBound(sources, request.pages);
    if (output.byteLength > bound) {
      violations.push({
        property: "size-bound",
        detail: `${output.byteLength} > ${Math.round(bound)} bytes`,
      });
    }
  }

  const found = await inspectPdf(output, async (inspection): Promise<Violation[]> => {
    if (inspection.status === "password-required") {
      return [{ property: "pdf-opens", detail: "asks for a password" }];
    }
    if (inspection.status === "unopenable") {
      return [{ property: "pdf-opens", detail: inspection.detail }];
    }
    const { pdf } = inspection;
    const pageViolations: Violation[] = [];
    if (pdf.pageCount !== request.pages.length) {
      pageViolations.push({
        property: "page-count",
        detail: `${request.pages.length} images → ${pdf.pageCount} pages`,
      });
    }
    const firstPageError =
      pdf.pageCount === 0
        ? "no pages"
        : depth === "full"
          ? await pdf.renderError(1)
          : await pdf.loadError(1);
    if (firstPageError !== null) {
      pageViolations.push({ property: "first-page-renders", detail: firstPageError });
    }
    if (depth === "full") pageViolations.push(...(await checkPages(pdf, sources, request)));
    return pageViolations;
  });
  violations.push(...found);

  return violations;
};
