// Section assembler for the unified PDF page editor (pdf-arrange).
// pdf-lib ONLY — never imports pdfjs. This keeps output generation working even
// if thumbnail rendering (pdfjs) fails (offline, missing assets). Takes the
// sections produced by splitIntoSections and turns each into a PDF byte array.

import JSZip from "jszip";
import { PDFDocument, degrees, rgb } from "pdf-lib";
import { type PageItem, buildOutputNames } from "./pageItem";
import { computeImageFit } from "./imageFit";

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

    for (const item of section) {
      if (item.kind === "pdf") {
        const src = await getSourceDoc(item.sourceFileId);
        const [page] = await out.copyPages(src, [item.sourcePageIndex]);
        if (item.rotation !== 0) {
          const current = page.getRotation().angle;
          page.setRotation(degrees(current + item.rotation));
        }
        out.addPage(page);
      } else {
        const bytes = sourceBytesById.get(item.sourceFileId);
        if (!bytes) throw new Error(`원본 파일을 찾을 수 없습니다: ${item.sourceFileId}`);
        const image =
          detectImageFormat(bytes) === "png"
            ? await out.embedPng(bytes)
            : await out.embedJpg(bytes);
        const { width: imgW, height: imgH } = image.scale(1);

        if (imageLayout.mode === "native") {
          const page = out.addPage([imgW, imgH]);
          page.drawImage(image, { x: 0, y: 0, width: imgW, height: imgH });
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
          page.drawImage(image, {
            x: fit.x,
            y: fit.y,
            width: fit.drawW,
            height: fit.drawH,
            rotate: degrees(fit.rotateDeg),
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
