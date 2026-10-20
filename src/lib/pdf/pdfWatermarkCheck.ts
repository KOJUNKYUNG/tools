import type { OutputChecker, Violation } from "@/lib/output-check/core";
import { inspectPdf, type PdfReport } from "@/lib/output-check/pdfInspector";
import type { OverlayOptions } from "./applyPdfOverlay";

const PDF_HEADER = new TextEncoder().encode("%PDF");
const EOF_MARKER = new TextEncoder().encode("%%EOF");

/** PDF white-space bytes (NUL, HT, LF, FF, CR, SP; ISO 32000-1 §7.2.2). */
const WHITE_SPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);

/**
 * Whether `bytes` look like a whole file: `%PDF` first and `%%EOF` last,
 * give or take trailing white space. pdf-lib ends on a bare `%%EOF`, but the
 * input, returned as-is when no page is selected, usually ends in an EOL.
 * Empty or cut-off bytes fail, whatever the input is.
 */
function isWholePdf(bytes: Uint8Array): boolean {
  let end = bytes.byteLength;
  while (end > 0 && WHITE_SPACE.has(bytes[end - 1])) end--;
  const tail = bytes.subarray(end - EOF_MARKER.byteLength, end);
  return (
    end > PDF_HEADER.byteLength + EOF_MARKER.byteLength &&
    PDF_HEADER.every((byte, i) => bytes[i] === byte) &&
    EOF_MARKER.every((byte, i) => tail[i] === byte)
  );
}

/**
 * An image's worst-case size once embedded: raw RGB plus an alpha mask, or
 * the logo file itself, which pdf-lib embeds byte for byte when it is a JPEG
 * (metadata and all).
 */
const embeddedImageBound = (width: number, height: number, logoSize: number) =>
  Math.max(width * height * 4, logoSize) + 1024;

/** The logo file's size, for an image watermark; else 0. */
const logoSize = (request: OverlayOptions) =>
  request.mode === "watermark" && request.source === "image" && request.logo
    ? request.logo.bytes.byteLength
    : 0;

/** What the engine drew on the selected pages, as far as pdfjs can see. */
interface Marks {
  /** Worst-case embedded size per distinct mark image. */
  imageBytes: Map<string, number>;
  /** How many times a mark is painted, across all selected pages. */
  paints: number;
}

/** Allowance for pdf-lib's rewrite of the input's structure. */
const rewriteMargin = (inputSize: number) => inputSize / 50 + 16_384;
/** Allowance per drawn mark and per selected page for operators and resources. */
const DRAWING_BYTES = 512;

/**
 * The size bound: the input, plus each distinct mark image (one watermark, or
 * one per page-number label), plus margins for the rewrite and the drawing.
 */
function sizeBound(inputSize: number, marks: Marks, selectedPages: number): number {
  let bound = inputSize + rewriteMargin(inputSize) + DRAWING_BYTES * (selectedPages + marks.paints);
  for (const bytes of marks.imageBytes.values()) bound += bytes;
  return bound;
}

/**
 * Walk every page of the input and the output (full depth only).
 *
 * An unselected page must draw exactly what it drew before (same operator
 * count), else `untouched-pages`. On a selected page the engine appends its
 * drawing after the page's own content, so its marks are the images it
 * paints beyond those the input page paints. Marks are null when a selected
 * page does not render: they cannot be measured.
 */
async function comparePages(
  source: PdfReport,
  output: PdfReport,
  selected: Set<number>,
  logoBytes: number,
): Promise<{ violations: Violation[]; marks: Marks | null }> {
  const violations: Violation[] = [];
  const marks: Marks = { imageBytes: new Map(), paints: 0 };
  let measurable = true;

  const pages = Math.min(source.pageCount, output.pageCount);
  for (let n = 1; n <= pages; n++) {
    const before = await source.content(n).catch(() => null);
    const after = await output.content(n).catch(() => null);
    if (selected.has(n)) {
      if (!after) {
        measurable = false;
        continue;
      }
      const added = after.images.slice(before?.images.length ?? 0);
      for (const { id, width, height } of added) {
        marks.imageBytes.set(id, embeddedImageBound(width, height, logoBytes));
      }
      marks.paints += added.length;
      continue;
    }
    // A page the input cannot render either has nothing to compare against.
    if (!before) continue;
    if (!after) {
      violations.push({ property: "untouched-pages", detail: `page ${n}: does not render` });
    } else if (after.operatorCount !== before.operatorCount) {
      violations.push({
        property: "untouched-pages",
        detail: `page ${n}: ${before.operatorCount} → ${after.operatorCount} operators`,
      });
    }
  }
  return { violations, marks: measurable ? marks : null };
}

/**
 * pdf-watermark output properties (spec #51, confirmed in #60), for both
 * modes (watermark and page numbers). pdf-lib wrote the output; pdfjs reads
 * it, so the checks are cross-engine. ⚡ = also at `quick`.
 *
 * - ⚡ `pdf-opens`: the output is whole (`%PDF` … `%%EOF` (+ EOL), checked even when
 *   pdfjs cannot open the input) and opens in pdfjs without a password
 * - ⚡ `page-count`: it has the input's page count
 * - ⚡ `first-page-renders`: its page 1 renders at `full`; `quick` only loads
 *   it. Measured on the real-file set, rendering page 1 (often a full-page
 *   image) took the quick check to +52% of processing, loading it to +11%
 * - `untouched-pages`: pages the user did not select are unchanged (see
 *   `comparePages`)
 * - `size-bound`: see `sizeBound`
 *
 * Defects the input already had are not the tool's doing: an input pdfjs
 * cannot open, a page 1 that does not render in the input either, and pages
 * the input cannot render are not judged.
 */
export const checkPdfWatermark: OutputChecker<Uint8Array, OverlayOptions, Uint8Array> = async (
  input,
  request,
  output,
  depth,
) => {
  if (!isWholePdf(output)) {
    return [{ property: "pdf-opens", detail: `not a whole PDF (${output.byteLength} bytes)` }];
  }
  return inspectPdf(input, async (inputInspection) => {
    const source = inputInspection.status === "open" ? inputInspection.pdf : null;
    return inspectPdf(output, async (inspection): Promise<Violation[]> => {
      if (inspection.status !== "open") {
        if (!source) return [];
        const detail =
          inspection.status === "unopenable" ? inspection.detail : "asks for a password";
        return [{ property: "pdf-opens", detail }];
      }
      const { pdf } = inspection;
      const violations: Violation[] = [];
      if (source && pdf.pageCount !== source.pageCount) {
        violations.push({
          property: "page-count",
          detail: `${source.pageCount} pages → ${pdf.pageCount}`,
        });
      }
      if (pdf.pageCount > 0) {
        const pageError = depth === "full" ? await pdf.renderError(1) : await pdf.loadError(1);
        if (
          pageError !== null &&
          source !== null &&
          source.pageCount > 0 &&
          (await source.renderError(1)) === null
        ) {
          violations.push({ property: "first-page-renders", detail: pageError });
        }
      }
      if (depth === "full" && source) {
        const selected = new Set(request.pages);
        const pages = await comparePages(source, pdf, selected, logoSize(request));
        violations.push(...pages.violations);
        const bound = pages.marks && sizeBound(input.byteLength, pages.marks, selected.size);
        if (bound && output.byteLength > bound) {
          violations.push({
            property: "size-bound",
            detail: `${output.byteLength} > ${Math.round(bound)} bytes`,
          });
        }
      }
      return violations;
    });
  });
};
