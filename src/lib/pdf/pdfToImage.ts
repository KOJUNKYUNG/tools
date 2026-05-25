import type { PDFDocumentProxy } from "pdfjs-dist";
import { getPdfjsLib, pdfjsDocParams } from "./pdfjs";
import { assignImageNames } from "./pdfToImageNaming";
import type { ConversionJob } from "./buildConversionJobs";

export type OutputFormat = "image/jpeg" | "image/png";
export type DpiOption = 72 | 150 | 300;

export interface ConvertedImage {
  name: string;
  blob: Blob;
}

export interface PdfToImageOptions {
  jobs: ConversionJob[];
  /** Raw source bytes per file id (shared with the thumbnail cache). */
  sourceBytesById: Map<string, Uint8Array>;
  format: OutputFormat;
  dpi: DpiOption;
  onProgress?: (pct: number) => void;
}

const PDF_BASE_DPI = 72;
/**
 * Browser canvas safety caps. A large page (A0 / poster / scanned score) at
 * 300 DPI can exceed the max canvas dimension or area, after which the browser
 * silently allocates a blank backing store (or toBlob yields null). 8192 matches
 * the dimension ceiling the image tools use; the area cap keeps mobile/Safari
 * (which allow far less than desktop Chrome) from emitting blank images.
 */
const MAX_CANVAS_DIM = 8192;
const MAX_CANVAS_AREA = 24_000_000;

/**
 * Render each job (one source page) to an image. Pages are rendered in job order
 * across possibly several source PDFs; each pdfjs document is opened once and
 * reused. Rotation is the page's intrinsic rotation plus the user's edit.
 */
export async function pdfToImages({
  jobs,
  sourceBytesById,
  format,
  dpi,
  onProgress,
}: PdfToImageOptions): Promise<ConvertedImage[]> {
  if (jobs.length === 0) throw new Error("변환할 페이지가 없습니다.");

  const pdfjsLib = await getPdfjsLib();
  const docCache = new Map<string, PDFDocumentProxy>();

  const getDoc = async (fileId: string): Promise<PDFDocumentProxy> => {
    let doc = docCache.get(fileId);
    if (!doc) {
      const bytes = sourceBytesById.get(fileId);
      if (!bytes) throw new Error("소스 PDF를 찾을 수 없습니다.");
      // slice() → fresh buffer pdfjs may detach without harming the shared
      // bytes the live thumbnail cache still reads from (trap i).
      doc = await pdfjsLib.getDocument({ data: bytes.slice(), ...pdfjsDocParams })
        .promise;
      docCache.set(fileId, doc);
    }
    return doc;
  };

  const scale = dpi / PDF_BASE_DPI;
  const ext = format === "image/png" ? "png" : "jpg";
  const quality = format === "image/jpeg" ? 0.92 : undefined;
  const total = jobs.length;
  // Name every output after its own source PDF, numbered within that source.
  const names = assignImageNames(jobs, ext);
  const images: ConvertedImage[] = [];

  try {
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      try {
        const doc = await getDoc(job.sourceFileId);
        const page = await doc.getPage(job.sourcePageIndex + 1);
        // Match the thumbnail (rendered at page.rotate) + the card's CSS rotate.
        const rotation = (page.rotate + job.rotation) % 360;

        // Downscale oversized pages to fit the browser canvas limits, so a huge
        // page never produces a blank image instead of a smaller, valid one.
        let viewport = page.getViewport({ scale, rotation });
        const over = Math.max(
          viewport.width / MAX_CANVAS_DIM,
          viewport.height / MAX_CANVAS_DIM,
          Math.sqrt((viewport.width * viewport.height) / MAX_CANVAS_AREA),
        );
        if (over > 1) {
          viewport = page.getViewport({ scale: scale / over, rotation });
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D 컨텍스트를 만들 수 없습니다.");

        await page.render({ canvas, viewport }).promise;

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("Canvas → Blob 변환 실패"))),
            format,
            quality,
          );
        });

        images.push({ name: names[i], blob });

        // Release the canvas backing store immediately (OOM guard for big PDFs).
        canvas.width = 0;
        canvas.height = 0;
      } catch (err) {
        // Isolate per-page failures so one bad page never discards the whole
        // batch (mirrors buildPageItems' per-file isolation). The slot's name is
        // skipped, leaving a numbering gap that signals the dropped page.
        console.warn(`pdf-to-image: page ${i + 1} 변환 실패`, err);
      } finally {
        onProgress?.(Math.round(((i + 1) / total) * 100));
      }
    }
  } finally {
    for (const doc of docCache.values()) doc.destroy();
  }

  if (images.length === 0) {
    throw new Error("변환된 페이지가 없습니다.");
  }

  return images;
}
