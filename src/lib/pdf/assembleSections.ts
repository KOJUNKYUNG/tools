// Section assembler for the unified PDF page editor (pdf-arrange).
// Assembly is pdf-lib ONLY. pdfjs is loaded lazily, and only by the output
// check in `arrangePdf`; if it fails to load (offline, missing assets), the
// check hands the output back unchecked, so output generation keeps working.
// Takes the sections produced by splitIntoSections and turns each into a PDF
// byte array.

import JSZip from "jszip";
import {
  type PDFImage,
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
import { runOutputCheck } from "@/lib/output-check/core";
import { type PageItem, buildOutputNames } from "./pageItem";
import { computeImageFit } from "./imageFit";
import {
  type ExifOrientation,
  orientationMatrix,
  orientedSize,
  readJpegOrientation,
} from "./jpegOrientation";
import { checkImageToPdf } from "./imageToPdfCheck";
import { checkPdfArrange } from "./pdfArrangeCheck";

export type ImageLayout =
  | { mode: "native" }
  | { mode: "fixed"; widthPt: number; heightPt: number };

export interface AssembleInput {
  /** Output sections, already split + deletion-filtered (see splitIntoSections). */
  sections: PageItem[][];
  /** Raw bytes per source file id: pdf bytes for pdf pages, image bytes for images. */
  sourceBytesById: Map<string, Uint8Array>;
  /** Image placement. Default: native (page = image size, current behavior). */
  imageLayout?: ImageLayout;
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
  throw new Error("지원하지 않는 이미지 형식입니다 (PNG/JPG만 가능).");
}

/**
 * Draw `image` as it is meant to be seen: upright per its EXIF `orientation`,
 * filling a `width`×`height` box (its displayed size) anchored at (x, y) and
 * turned `rotate` degrees counterclockwise about that anchor, as pdf-lib's
 * drawImage does for an upright image.
 */
function drawOrientedImage(
  page: PDFPage,
  image: PDFImage,
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
  { sections, sourceBytesById, imageLayout = { mode: "native" } }: AssembleInput,
  onProgress?: (pct: number) => void,
): Promise<Uint8Array[]> {
  const sourceDocCache = new Map<string, PDFDocument>();

  async function getSourceDoc(id: string): Promise<PDFDocument> {
    const cached = sourceDocCache.get(id);
    if (cached) return cached;
    const bytes = sourceBytesById.get(id);
    if (!bytes) throw new Error(`원본 파일을 찾을 수 없습니다: ${id}`);
    const doc = await PDFDocument.load(bytes);
    sourceDocCache.set(id, doc);
    return doc;
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
        const isPng = detectImageFormat(bytes) === "png";
        const image = isPng ? await out.embedPng(bytes) : await out.embedJpg(bytes);
        // The JPEG stays as stored; its EXIF orientation is applied when drawn,
        // so the page shows what the editor's thumbnail shows.
        const orientation = isPng ? 1 : readJpegOrientation(bytes);
        const stored = image.scale(1);
        const [imgW, imgH] = orientedSize(stored.width, stored.height, orientation);

        if (imageLayout.mode === "native") {
          const page = out.addPage([imgW, imgH]);
          drawOrientedImage(page, image, orientation, { x: 0, y: 0, width: imgW, height: imgH });
          if (item.rotation !== 0) page.setRotation(degrees(item.rotation));
        } else {
          const { widthPt, heightPt } = imageLayout;
          const page = out.addPage([widthPt, heightPt]);
          page.drawRectangle({
            x: 0,
            y: 0,
            width: widthPt,
            height: heightPt,
            color: rgb(1, 1, 1),
          });
          const fit = computeImageFit(imgW, imgH, widthPt, heightPt, item.rotation);
          drawOrientedImage(page, image, orientation, {
            x: fit.x,
            y: fit.y,
            width: fit.drawW,
            height: fit.drawH,
            rotate: fit.rotateDeg,
          });
        }
      }

      done++;
      if (totalPages > 0) onProgress?.(Math.round((done / totalPages) * 100));
    }

    outputs.push(await out.save());
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
  input: Omit<AssembleInput, "imageLayout">,
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
 * image-to-pdf's engine entry: one PDF with a page per image, laid out as
 * chosen, then the tool's output check (see `imageToPdfCheck.ts`). A failing
 * check has no safer mode to fall back to, so it blocks with the
 * corrupt-output error.
 */
export async function convertImagesToPdf(
  {
    pages,
    sourceBytesById,
    imageLayout,
  }: {
    /** The images the user kept, in order. */
    pages: PageItem[];
    sourceBytesById: Map<string, Uint8Array>;
    imageLayout: ImageLayout;
  },
  onProgress?: (pct: number) => void,
): Promise<Uint8Array> {
  const [output] = await assembleSections(
    { sections: [pages], sourceBytesById, imageLayout },
    onProgress,
  );
  return runOutputCheck({
    tool: "image-to-pdf",
    output,
    check: (out) =>
      checkImageToPdf(sourceBytesById, { pages, imageLayout }, out, "quick"),
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
