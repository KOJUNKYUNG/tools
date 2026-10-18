import type { CompressionPreset } from "@/lib/common/compressionPreset";
import type { OutputChecker, Violation } from "@/lib/output-check/core";
import { inspectPdf, pdfPageCount } from "@/lib/output-check/pdfInspector";
import { notSmaller, SIZE_BOUND } from "@/lib/output-check/sizeBound";
import { hasInvalidSoftMask } from "./softMaskCheck";

export interface PdfCompressRequest {
  preset: CompressionPreset;
}

const hasPdfHeader = (b: Uint8Array) =>
  b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

const inputOpens = async (input: Uint8Array) =>
  hasPdfHeader(input) && (await pdfPageCount(input)) !== null;

const inputFirstPageFails = (input: Uint8Array) =>
  inspectPdf(input, async (i) =>
    i.status !== "open" || i.pdf.pageCount === 0 || (await i.pdf.renderError(1)) !== null,
  );

/**
 * pdf-compress output properties (spec #51, confirmed in #60), all ⚡ (`quick`
 * and `full` check the same). justpdf wrote the output; pdfjs reads it, so the
 * opens, page-count and render checks are cross-engine.
 *
 * - `size-bound`: the output is strictly smaller than the input. This one is
 *   an outcome, not damage: the engine turns it into a "could not shrink"
 *   result instead of blocking (see compressPdf.ts)
 * - `soft-mask`: no soft mask declares a colour space other than DeviceGray
 *   (see softMaskCheck.ts)
 * - `pdf-opens`: the output starts with `%PDF` and opens in pdfjs without a
 *   password
 * - `page-count`: the output has the input's page count
 * - `first-page-renders`: the output's page 1 renders in pdfjs (the preview
 *   used to swallow this failure)
 *
 * Defects the input already had are not the tool's doing: an invalid soft
 * mask, a file pdfjs cannot open, or a page 1 that does not render, when the
 * input has it too, is not reported. The input is only read when the output
 * shows the defect, except for its page count.
 */
export const checkPdfCompress: OutputChecker<Uint8Array, PdfCompressRequest, Uint8Array> =
  async (input, _request, output) => {
    const violations: Violation[] = [];
    if (notSmaller(input, output)) {
      violations.push({
        property: SIZE_BOUND,
        detail: `${input.byteLength} → ${output.byteLength} bytes`,
      });
    }
    if (hasInvalidSoftMask(output) && !hasInvalidSoftMask(input)) {
      violations.push({ property: "soft-mask", detail: "a soft mask is not DeviceGray" });
    }

    if (!hasPdfHeader(output)) {
      if (await inputOpens(input)) {
        violations.push({ property: "pdf-opens", detail: `no %PDF header (${output.byteLength} bytes)` });
      }
      return violations;
    }

    const damage = await inspectPdf(output, async (inspection): Promise<Violation[]> => {
      if (inspection.status !== "open") {
        const detail =
          inspection.status === "unopenable" ? inspection.detail : "asks for a password";
        return (await inputOpens(input)) ? [{ property: "pdf-opens", detail }] : [];
      }
      const { pdf } = inspection;
      const vs: Violation[] = [];
      const pages = await pdfPageCount(input);
      if (pages !== null && pdf.pageCount !== pages) {
        vs.push({ property: "page-count", detail: `${pages} pages → ${pdf.pageCount}` });
      }
      if (pdf.pageCount > 0) {
        const renderError = await pdf.renderError(1);
        if (renderError !== null && !(await inputFirstPageFails(input))) {
          vs.push({ property: "first-page-renders", detail: renderError });
        }
      }
      return vs;
    });
    return [...violations, ...damage];
  };
