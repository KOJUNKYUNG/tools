import { CORRUPT_OUTPUT_PREFIX } from "@/lib/errors";
import { runOutputCheck } from "@/lib/output-check/core";
import type { OutputFormat } from "./pdfToImage";
import { checkPageImage, type RenderedPage } from "./pdfToImageCheck";

/** `reduced`: the retry after a failed page, at a lower resolution. */
export type Resolution = "requested" | "reduced";

/**
 * A page that could not be turned into a usable image, even at a reduced
 * resolution. The run stops here: a page is never skipped. pdf-to-image
 * catches it to name the page (and the parts already saved) in its message;
 * the corrupt-output prefix covers any other caller.
 */
export class PageConversionError extends Error {
  constructor(
    /** 1-based position among the selected pages. */
    readonly pageNumber: number,
    detail: string,
  ) {
    super(detail.startsWith(CORRUPT_OUTPUT_PREFIX) ? detail : `${CORRUPT_OUTPUT_PREFIX}: ${detail}`);
    this.name = "PageConversionError";
  }
}

/**
 * Render one page and check its image (the run-time output check). A failed
 * render or a failing image is retried once at a reduced resolution; if that
 * fails too, throws PageConversionError.
 */
export async function renderCheckedPage(
  pageNumber: number,
  format: OutputFormat,
  render: (resolution: Resolution) => Promise<RenderedPage>,
): Promise<Blob> {
  // A render that throws produced no image, which the check reports.
  const attempt = (resolution: Resolution) =>
    render(resolution).catch((err: unknown): RenderedPage => {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[output-check] pdf-to-image: page ${pageNumber} (${resolution}) failed to render`, err);
      }
      return { blob: null, width: 0, height: 0 };
    });

  let page: RenderedPage;
  try {
    page = await runOutputCheck({
      tool: "pdf-to-image",
      output: await attempt("requested"),
      check: (output) => checkPageImage(pageNumber, { format }, output, "quick"),
      recover: () => attempt("reduced"),
    });
  } catch (err) {
    throw new PageConversionError(pageNumber, err instanceof Error ? err.message : String(err));
  }
  // A checked page has an image; only a crashed check hands one back
  // unverified, and the check cannot crash before it has found the image.
  if (!page.blob) throw new PageConversionError(pageNumber, `page ${pageNumber}: no image`);
  return page.blob;
}
