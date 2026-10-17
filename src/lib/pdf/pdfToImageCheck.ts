import type { OutputChecker, Violation } from "@/lib/output-check/core";
import { readImageHeader } from "@/lib/output-check/imageHeader";
import type { OutputFormat } from "./pdfToImage";

/** One page's render: the encoded image (null when rendering failed) and its planned size. */
export interface RenderedPage {
  blob: Blob | null;
  /**
   * The canvas size the engine planned for this page: the DPI request,
   * downscaled for oversized pages (so not the raw DPI size).
   */
  width: number;
  height: number;
}

export interface PageImageRequest {
  format: OutputFormat;
}

const HEADER_FORMAT = { "image/png": "png", "image/jpeg": "jpeg" } as const;

/**
 * The browser's own decoder, as a second reader of the image. Run time only:
 * Node has no `createImageBitmap`, so a Node caller would crash the check
 * (tests stand one in).
 */
async function decodes(blob: Blob): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(blob);
    bitmap.close();
    return true;
  } catch (err) {
    // A missing decoder is a checker gap, not a broken image.
    if (err instanceof ReferenceError) throw err;
    return false;
  }
}

/**
 * pdf-to-image output properties for one page image (spec #51, confirmed in
 * #60), all ⚡ (checked right after the page renders):
 *
 * - `page-image`: the page produced an image (never a silent gap)
 * - `image-format`: its header is the requested format
 * - `image-size`: its header size is the size the engine planned
 * - `image-decodes`: the browser decodes it
 *
 * The run's image count equals the selected page count because the engine
 * checks every page this way and stops at the first that fails. No size
 * bound: the confirmed properties (#60) declare none, as the size follows
 * the DPI and the page content, not the input file.
 */
export const checkPageImage: OutputChecker<number, PageImageRequest, RenderedPage> = async (
  pageNumber,
  { format },
  { blob, width, height },
) => {
  const at = `page ${pageNumber}`;
  if (!blob || blob.size === 0) {
    return [{ property: "page-image", detail: `${at}: no image` }];
  }

  const violations: Violation[] = [];
  const header = readImageHeader(new Uint8Array(await blob.arrayBuffer()));
  if (!header || header.format !== HEADER_FORMAT[format]) {
    violations.push({
      property: "image-format",
      detail: `${at}: expected ${HEADER_FORMAT[format]}, got ${header?.format ?? "unreadable bytes"}`,
    });
  }
  if (header && (header.width !== width || header.height !== height)) {
    violations.push({
      property: "image-size",
      detail: `${at}: ${header.width}×${header.height}, planned ${width}×${height}`,
    });
  }
  if (!(await decodes(blob))) {
    violations.push({ property: "image-decodes", detail: `${at}: the browser cannot decode it` });
  }
  return violations;
};
