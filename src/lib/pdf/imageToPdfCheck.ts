import type { OutputChecker, Violation } from "@/lib/output-check/core";
import { type ImageHeader, readImageHeader } from "@/lib/output-check/imageHeader";
import { inspectPdf, type PdfImagePaint, type PdfReport } from "@/lib/output-check/pdfInspector";
import { pdfJpegs } from "@/lib/output-check/pdfJpegs";
import type { PageItem } from "./pageItem";
import type { PageMarginMm, PageOrientation, PagePreset, PageSize } from "./pageSize";

/** Raw bytes per source image id (PNG or JPEG). */
export type ImageToPdfSources = Map<string, Uint8Array>;

export interface ImageToPdfRequest {
  /** The images the user kept, in order: one page each. */
  pages: PageItem[];
  pageSize: PageSize;
  /** How preset and custom pages are turned; ignored under image fit. Default: auto. */
  orientation?: PageOrientation;
  /** The white on every side of a preset or custom page; ignored under image fit. Default: none. */
  marginMm?: PageMarginMm;
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

// The checker's own table and rules, written from the spec (#176) rather
// than imported from the engine. Sizes as listed: paper portrait in mm,
// screens landscape in inches (PowerPoint's default slides).
const MM = 72 / 25.4;
const LISTED_PT: Record<PagePreset, [number, number]> = {
  a3: [297 * MM, 420 * MM],
  a4: [210 * MM, 297 * MM],
  a5: [148 * MM, 210 * MM],
  b4: [257 * MM, 364 * MM],
  b5: [182 * MM, 257 * MM],
  letter: [8.5 * 72, 11 * 72],
  "16:9": [12192000 / 12700, 7.5 * 72], // 13.333 in: PowerPoint's 12192000 EMU
  "4:3": [10 * 72, 7.5 * 72],
};
/** A custom side is held within 1 mm and PDF's largest page side, 200 in. */
const MIN_SIDE_PT = MM;
const MAX_SIDE_PT = 200 * 72;

/**
 * The page box and turn the page size calls for, with the picture's shown
 * size (EXIF orientations 5–8 swap the stored sides). Image fit: that size
 * in points, turned by /Rotate, whatever the orientation. Preset or custom:
 * the size listed, upright (the engine draws the user's turn into the
 * page), its long side up under portrait, across under landscape, and under
 * auto along the picture's long side once turned; a square picture keeps it
 * as listed. `margin` is the white on every side, in points: none under
 * image fit, otherwise the margin asked for, at most a quarter of the
 * page's short side.
 */
function expectedPage(
  { pageSize, orientation = "auto", marginMm = 0 }: ImageToPdfRequest,
  item: PageItem,
  sources: ImageToPdfSources,
): { width: number; height: number; rotation: number; pictureAspect: number; margin: number } {
  const { width, height, orientation: exif } = headerOf(sources, item.sourceFileId);
  const exifTurned = exif >= 5;
  const shownW = exifTurned ? height : width;
  const shownH = exifTurned ? width : height;
  if (pageSize.kind === "image-fit") {
    // Drawn upright on the page; /Rotate turns the whole page.
    return {
      width: shownW,
      height: shownH,
      rotation: item.rotation,
      pictureAspect: shownW / shownH,
      margin: 0,
    };
  }
  const [w, h] =
    pageSize.kind === "preset"
      ? LISTED_PT[pageSize.preset]
      : [pageSize.widthMm * MM, pageSize.heightMm * MM].map((side) =>
          Math.min(MAX_SIDE_PT, Math.max(MIN_SIDE_PT, side)),
        );
  const userTurned = normalise(item.rotation) % 180 === 90;
  const [picW, picH] = userTurned ? [shownH, shownW] : [shownW, shownH];
  const wantAcross =
    orientation === "auto" ? (picW === picH ? w > h : picW > picH) : orientation === "landscape";
  const turnPage = wantAcross !== w > h && w !== h;
  const pictureAspect = picW / picH;
  const margin = Math.min(marginMm * MM, Math.min(w, h) / 4);
  return turnPage
    ? { width: h, height: w, rotation: 0, pictureAspect, margin }
    : { width: w, height: h, rotation: 0, pictureAspect, margin };
}

/**
 * How each picture sits on its page: whole inside the content box (the page
 * less `margin` on every side), keeping its shape, as large as fits there
 * (touching two opposite sides of it) and centred. Empty when right.
 */
function fitProblems(
  box: PdfImagePaint["box"],
  page: { width: number; height: number },
  margin: number,
  pictureAspect: number,
): string[] {
  const problems: string[] = [];
  const edge = 0.01;
  if (box.x0 < -edge || box.y0 < -edge || box.x1 > page.width + edge || box.y1 > page.height + edge) {
    problems.push("past the page's edge");
  } else if (
    box.x0 < margin - edge ||
    box.y0 < margin - edge ||
    box.x1 > page.width - margin + edge ||
    box.y1 > page.height - margin + edge
  ) {
    problems.push("into the margin");
  }
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const contentW = page.width - 2 * margin;
  const contentH = page.height - 2 * margin;
  if (Math.abs(w / h / pictureAspect - 1) > 0.005) problems.push("not its shape");
  if (Math.abs(w - contentW) > edge && Math.abs(h - contentH) > edge) problems.push("smaller than fits");
  const centre = 0.1;
  if (
    Math.abs(box.x0 + box.x1 - page.width) / 2 > centre ||
    Math.abs(box.y0 + box.y1 - page.height) / 2 > centre
  ) {
    problems.push("off centre");
  }
  return problems;
}

async function checkPages(
  pdf: PdfReport,
  sources: ImageToPdfSources,
  request: ImageToPdfRequest,
): Promise<Violation[]> {
  const { pages } = request;
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

    const expected = expectedPage(request, pages[j], sources);
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
    const { images } = await pdf.content(n);
    for (const { box } of images) {
      const problems = fitProblems(box, out, expected.margin, expected.pictureAspect);
      if (problems.length > 0) {
        violations.push({ property: "picture-fit", detail: `page ${n}: picture ${problems.join(", ")}` });
      }
    }
  }
  return violations;
}

/**
 * The size bound: the PDF holds its images plus a little structure per page.
 * A JPEG is embedded as-is, less its photo info. A PNG keeps its own
 * compressed data only when a PDF image can hold it as it is; one with
 * transparency or interlacing is decoded and deflated again, which can come
 * out larger than a carefully optimised file, so it is allowed its raw size
 * (8-bit RGB plus alpha): deflate never exceeds that by more than the margin.
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
 * Every JPEG in the PDF is one of the user's pictures, so none may carry
 * photo info. One that cannot be read is reported too: what it carries is
 * unknown.
 */
function photoInfoViolations(output: Uint8Array): Violation[] {
  return pdfJpegs(output).flatMap((jpeg, i): Violation[] => {
    const at = `picture ${i + 1}`;
    if (!jpeg.readable) return [{ property: "photo-info", detail: `${at}: cannot be read (${jpeg.detail})` }];
    const { photoInfo } = jpeg.reading;
    return photoInfo.length > 0 ? [{ property: "photo-info", detail: `${at}: ${photoInfo.join(", ")}` }] : [];
  });
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
 * - `page-size` / `page-rotation`: each page follows the page size. Image
 *   fit: the image's size as displayed (EXIF orientation applied), turned as
 *   requested. Preset or custom: that size (custom held within 1 mm–200 in),
 *   upright, portrait or landscape as asked, or under auto turned to the
 *   picture as the user turned it
 * - `picture-fit`: every picture is whole inside its page less the margin
 *   (none under image fit), keeping its shape, as large as fits there and
 *   centred
 * - `size-bound`: the PDF ≤ its images + a margin
 * - ⚡ `photo-info`: no embedded JPEG carries photo info (EXIF, XMP, maker
 *   data, comments, data after its end; CONTEXT "Photo info"), read from
 *   the file's bytes
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

  violations.push(...photoInfoViolations(output));

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
