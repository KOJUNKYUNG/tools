// Section assembler for the unified PDF page editor (pdf-arrange).
// Assembly is pdf-lib ONLY. pdfjs is loaded lazily, and only by the output
// check in `arrangePdf`; if it fails to load (offline, missing assets), the
// check hands the output back unchecked, so output generation keeps working.
// Takes the sections produced by splitIntoSections and turns each into a PDF
// byte array.

import JSZip from "jszip";
import {
  PDFDocument,
  type PDFPage,
  concatTransformationMatrix,
  degrees,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  rotateDegrees,
  translate,
} from "pdf-lib";
import { INVALID_INPUT_PREFIX } from "@/lib/errors";
import { slideCrop } from "@/lib/image/maxFitCrop";
import { type SizedImagePreparation, sizedImagePreparation } from "@/lib/image/slideImage";
import { stripPhotoInfo } from "@/lib/image/stripPhotoInfo";
import { runOutputCheck } from "@/lib/output-check/core";
import { type PageItem, buildOutputNames } from "./pageItem";
import { computeImageFit } from "./imageFit";
import { type EmbeddedImage, embedPng } from "./embedPng";
import { LOAD_WITH_RARE_YIELDS, SAVE_WITH_RARE_YIELDS } from "./pdfLibYields";
import {
  type ExifOrientation,
  orientationMatrix,
  orientedSize,
  readJpegOrientation,
} from "./jpegOrientation";
import { type ImageToPdfRequest, checkImageToPdf } from "./imageToPdfCheck";
import { checkPdfArrange } from "./pdfArrangeCheck";
import {
  type PageMargin,
  type PageOrientation,
  type PageSize,
  marginPt,
  pageBoxPt,
} from "./pageSize";

export interface AssembleInput {
  /** Output sections, already split + deletion-filtered (see splitIntoSections). */
  sections: PageItem[][];
  /** Raw bytes per source file id: pdf bytes for pdf pages, image bytes for images. */
  sourceBytesById: Map<string, Uint8Array>;
  /** The pages pictures get (CONTEXT "Page size"). Default: image fit. */
  pageSize?: PageSize;
  /** How preset and custom pages are turned. Default: auto. */
  orientation?: PageOrientation;
  /** The white on every side of a preset or custom page, or fill page. Default: none. */
  margin?: PageMargin;
  /**
   * Cuts a picture under fill page: the browser's canvas by default; tests
   * in Node pass a stand-in.
   */
  preparation?: SizedImagePreparation;
}

/** Detect raster format from magic bytes so PageItem need not carry a mime type. */
export function detectImageFormat(bytes: Uint8Array): "png" | "jpg" {
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  // The file is not what its name says: the user's file, not the tool.
  throw new Error(`${INVALID_INPUT_PREFIX}: not a PNG or JPEG image`);
}

/** A picture embedded in `out`, with the EXIF orientation it is drawn by and its shown size. */
async function embedPicture(
  out: PDFDocument,
  bytes: Uint8Array,
): Promise<{ image: EmbeddedImage; exifOrientation: ExifOrientation; shownW: number; shownH: number }> {
  const isPng = detectImageFormat(bytes) === "png";
  // A JPEG goes in without its photo info (CONTEXT "Photo info"), its
  // picture byte for byte. The EXIF orientation is read from the original
  // first and applied when drawn, so the page shows what the editor's
  // thumbnail shows. A PNG goes in losslessly and no larger than it is (see
  // embedPng).
  const image: EmbeddedImage = isPng ? await embedPng(out, bytes) : await out.embedJpg(stripPhotoInfo(bytes));
  const exifOrientation = isPng ? 1 : readJpegOrientation(bytes);
  const [shownW, shownH] = orientedSize(image.width, image.height, exifOrientation);
  return { image, exifOrientation, shownW, shownH };
}

/**
 * Draw `image` as it is meant to be seen: upright per its EXIF `orientation`,
 * filling a `width`×`height` box (its displayed size) anchored at (x, y) and
 * turned `rotate` degrees counterclockwise about that anchor, as pdf-lib's
 * drawImage does for an upright image.
 */
function drawOrientedImage(
  page: PDFPage,
  image: EmbeddedImage,
  orientation: ExifOrientation,
  { x, y, width, height, rotate = 0 }: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotate?: number;
  },
): void {
  const name = page.node.newXObject("Image", image.ref);
  page.pushOperators(
    pushGraphicsState(),
    translate(x, y),
    rotateDegrees(rotate),
    concatTransformationMatrix(...orientationMatrix(orientation, width, height)),
    drawObject(name),
    popGraphicsState(),
  );
}

/**
 * Assemble each section into a standalone PDF (as bytes).
 *
 * Source `PDFDocument`s are loaded once and cached by id, then reused across
 * sections. Progress is reported across the total page count (0–100).
 */
export async function assembleSections(
  {
    sections,
    sourceBytesById,
    pageSize = { kind: "image-fit" },
    orientation = "auto",
    margin = 0,
    preparation = sizedImagePreparation,
  }: AssembleInput,
  onProgress?: (pct: number) => void,
): Promise<Uint8Array[]> {
  const sourceDocCache = new Map<string, PDFDocument>();

  async function getSourceDoc(id: string): Promise<PDFDocument> {
    const cached = sourceDocCache.get(id);
    if (cached) return cached;
    const bytes = sourceBytesById.get(id);
    if (!bytes) throw new Error(`원본 파일을 찾을 수 없습니다: ${id}`);
    const doc = await PDFDocument.load(bytes, LOAD_WITH_RARE_YIELDS);
    sourceDocCache.set(id, doc);
    return doc;
  }

  /**
   * A page under fill page (CONTEXT "Fill page"): the page box follows the
   * picture as shown (EXIF orientation, then the user's turn), and the
   * picture covers it. Only the largest rectangle of the page's shape at the
   * picture's centre enters the PDF, cut by the preparation and saved once
   * in its own format; a picture already of the page's shape goes in whole,
   * as without fill page. Either is drawn across exactly the page, so a
   * picture within a pixel of its shape leaves no white edge.
   */
  async function addFilledPage(out: PDFDocument, bytes: Uint8Array, rotation: PageItem["rotation"]) {
    const source = new Blob([Uint8Array.from(bytes)]);
    const upright = await preparation.measure(source);
    // Non-null: fill page is never asked under image fit.
    const box = pageBoxPt(pageSize, upright.width, upright.height, rotation, orientation)!;
    const turned = rotation === 90 || rotation === 270;
    // The page as the picture sees it, before the user's turn.
    const [shapeW, shapeH] = turned ? [box.height, box.width] : [box.width, box.height];
    const crop = slideCrop({ w: upright.width, h: upright.height }, shapeW / shapeH);
    const whole = crop.width === upright.width && crop.height === upright.height;
    const kept = whole
      ? bytes
      : (await preparation.prepare(source, crop, { width: crop.width, height: crop.height }, undefined, "own")).bytes;
    const { image, exifOrientation } = await embedPicture(out, kept);
    const page = out.addPage([box.width, box.height]);
    const fit = computeImageFit(shapeW, shapeH, box.width, box.height, rotation);
    drawOrientedImage(page, image, exifOrientation, {
      x: fit.x,
      y: fit.y,
      width: fit.drawW,
      height: fit.drawH,
      rotate: fit.rotateDeg,
    });
  }

  const totalPages = sections.reduce((sum, s) => sum + s.length, 0);
  let done = 0;
  const outputs: Uint8Array[] = [];

  for (const section of sections) {
    const out = await PDFDocument.create();

    // One copyPages call per source: pdf-lib copies the objects pages share
    // (fonts, images) once per call, so copying page by page embedded a copy
    // of them for every page (a 6.8 MB deck came out at 28 MB).
    const indicesBySource = new Map<string, number[]>();
    for (const item of section) {
      if (item.kind !== "pdf") continue;
      const indices = indicesBySource.get(item.sourceFileId) ?? [];
      indices.push(item.sourcePageIndex);
      indicesBySource.set(item.sourceFileId, indices);
    }
    const copiedBySource = new Map<string, PDFPage[]>();
    for (const [id, indices] of indicesBySource) {
      copiedBySource.set(id, await out.copyPages(await getSourceDoc(id), indices));
    }

    for (const item of section) {
      if (item.kind === "pdf") {
        // Pages come back in the order requested, which is section order.
        // Non-null: every pdf item's source was copied above, one page each.
        const page = copiedBySource.get(item.sourceFileId)!.shift()!;
        if (item.rotation !== 0) {
          const current = page.getRotation().angle;
          page.setRotation(degrees(current + item.rotation));
        }
        out.addPage(page);
      } else {
        const bytes = sourceBytesById.get(item.sourceFileId);
        if (!bytes) throw new Error(`원본 파일을 찾을 수 없습니다: ${item.sourceFileId}`);
        if (margin === "fill" && pageSize.kind !== "image-fit") {
          await addFilledPage(out, bytes, item.rotation);
        } else {
          const { image, exifOrientation, shownW, shownH } = await embedPicture(out, bytes);
          const box = pageBoxPt(pageSize, shownW, shownH, item.rotation, orientation);
          if (box === null) {
            const page = out.addPage([shownW, shownH]);
            drawOrientedImage(page, image, exifOrientation, { x: 0, y: 0, width: shownW, height: shownH });
            if (item.rotation !== 0) page.setRotation(degrees(item.rotation));
          } else {
            const page = out.addPage([box.width, box.height]);
            page.drawRectangle({
              x: 0,
              y: 0,
              width: box.width,
              height: box.height,
              color: rgb(1, 1, 1),
            });
            // The picture fits whole inside the page less the margin.
            const m = marginPt(box, margin === "fill" ? 0 : margin);
            const fit = computeImageFit(shownW, shownH, box.width - 2 * m, box.height - 2 * m, item.rotation);
            drawOrientedImage(page, image, exifOrientation, {
              x: m + fit.x,
              y: m + fit.y,
              width: fit.drawW,
              height: fit.drawH,
              rotate: fit.rotateDeg,
            });
          }
        }
      }

      done++;
      if (totalPages > 0) onProgress?.(Math.round((done / totalPages) * 100));
    }

    outputs.push(await out.save(SAVE_WITH_RARE_YIELDS));
  }

  return outputs;
}

/**
 * pdf-arrange's engine entry: assemble the sections, then run the tool's
 * output check (see `pdfArrangeCheck.ts`) before handing the files back. A
 * failing check has no safer mode to fall back to, so it blocks with the
 * corrupt-output error.
 */
export async function arrangePdf(
  input: Omit<AssembleInput, "pageSize">,
  onProgress?: (pct: number) => void,
): Promise<Uint8Array[]> {
  const outputs = await assembleSections(input, onProgress);
  return runOutputCheck({
    tool: "pdf-arrange",
    output: outputs,
    check: (out) =>
      checkPdfArrange(input.sourceBytesById, { sections: input.sections }, out, "quick"),
  });
}

/**
 * image-to-pdf's engine entry: one PDF with a page per image, of the page
 * size chosen, then the tool's output check (see `imageToPdfCheck.ts`). A failing
 * check has no safer mode to fall back to, so it blocks with the
 * corrupt-output error. `preparation` cuts pictures under fill page: the
 * browser's canvas by default; tests in Node pass a stand-in.
 */
export async function convertImagesToPdf(
  { sourceBytesById, ...request }: ImageToPdfRequest & {
    sourceBytesById: Map<string, Uint8Array>;
  },
  onProgress?: (pct: number) => void,
  preparation: SizedImagePreparation = sizedImagePreparation,
): Promise<Uint8Array> {
  const { pages, pageSize, orientation, margin } = request;
  const [output] = await assembleSections(
    { sections: [pages], sourceBytesById, pageSize, orientation, margin, preparation },
    onProgress,
  );
  return runOutputCheck({
    tool: "image-to-pdf",
    output,
    check: (out) => checkImageToPdf(sourceBytesById, request, out, "quick"),
  });
}

export type PackagedOutput = {
  type: "pdf" | "zip";
  data: Uint8Array;
  filename: string;
};

/**
 * Package assembled outputs for download.
 * - 1 output  → the pdf itself (`{base}.pdf`)
 * - N outputs → a zip of `{base}-1.pdf` … `{base}-N.pdf` (`{base}-split.zip`)
 */
export async function packageOutputs(
  outputs: Uint8Array[],
  base: string,
): Promise<PackagedOutput> {
  if (outputs.length === 0) throw new Error("출력할 페이지가 없습니다.");

  const { zipName, fileNames } = buildOutputNames(base, outputs.length);

  if (outputs.length === 1) {
    return { type: "pdf", data: outputs[0], filename: fileNames[0] };
  }

  const zip = new JSZip();
  outputs.forEach((data, i) => zip.file(fileNames[i], data));
  const data = await zip.generateAsync({ type: "uint8array" });
  return { type: "zip", data, filename: zipName };
}
