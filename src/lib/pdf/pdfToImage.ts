import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { shouldFlush } from "./batchPlan";
import { getPdfjsLib, pdfjsDocParams } from "./pdfjs";
import { assignImageNames } from "./pdfToImageNaming";
import type { RenderedPage } from "./pdfToImageCheck";
import { renderCheckedPage, type Resolution } from "./pdfToImagePage";
import type { ConversionJob } from "./buildConversionJobs";

export type OutputFormat = "image/jpeg" | "image/png";
export type DpiOption = 72 | 150 | 300;

export interface ConvertedImage {
  name: string;
  blob: Blob;
}

export type PdfToImageOutcome =
  | { mode: "preview"; images: ConvertedImage[] }
  | { mode: "streamed"; imageCount: number; batchCount: number };

export interface PdfToImageOptions {
  jobs: ConversionJob[];
  /** Raw source bytes per file id (shared with the thumbnail cache). */
  sourceBytesById: Map<string, Uint8Array>;
  format: OutputFormat;
  dpi: DpiOption;
  /** Flush a batch once accumulated output reaches this many bytes. */
  batchByteTarget: number;
  /** Called with each filled batch when streaming (more than one batch). */
  onBatch?: (
    images: ConvertedImage[],
    batchIndex: number,
    isLast: boolean,
  ) => Promise<void> | void;
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
 * Render one page to an encoded image at `scale`, downscaled to the canvas
 * caps; the `reduced` retry halves that size. The returned size is the
 * planned canvas size, which the output check compares against the image's
 * header. Rotation is the page's intrinsic
 * rotation plus the user's edit.
 */
async function renderPage(
  page: PDFPageProxy,
  {
    scale,
    resolution,
    rotation: userRotation,
    format,
    quality,
  }: {
    scale: number;
    resolution: Resolution;
    rotation: number;
    format: OutputFormat;
    quality: number | undefined;
  },
): Promise<RenderedPage> {
  // Match the thumbnail (rendered at page.rotate) + the card's CSS rotate.
  const rotation = (page.rotate + userRotation) % 360;

  // Downscale oversized pages to fit the browser canvas limits, so a huge
  // page never produces a blank image instead of a smaller, valid one.
  const requested = page.getViewport({ scale, rotation });
  const over = Math.max(
    requested.width / MAX_CANVAS_DIM,
    requested.height / MAX_CANVAS_DIM,
    Math.sqrt((requested.width * requested.height) / MAX_CANVAS_AREA),
  );
  const fitted = over > 1 ? scale / over : scale;
  const viewport = page.getViewport({
    scale: resolution === "reduced" ? fitted / 2 : fitted,
    rotation,
  });

  const canvas = document.createElement("canvas");
  const width = Math.floor(viewport.width);
  const height = Math.floor(viewport.height);
  canvas.width = width;
  canvas.height = height;
  try {
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
    return { blob, width, height };
  } finally {
    // Release the canvas backing store immediately (OOM guard for big PDFs).
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Render each job (one source page) to an image. Pages are rendered in job order
 * across possibly several source PDFs; each pdfjs document is opened once and
 * reused.
 */
export async function pdfToImages({
  jobs,
  sourceBytesById,
  format,
  dpi,
  batchByteTarget,
  onBatch,
  onProgress,
}: PdfToImageOptions): Promise<PdfToImageOutcome> {
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

  // `current` holds only the in-flight batch (released after each flush), so peak
  // memory is bounded by batchByteTarget rather than the whole job's output.
  const current: ConvertedImage[] = [];
  let currentBytes = 0;
  let streaming = false;
  let batchIndex = 0;

  const flush = async (isLast: boolean) => {
    batchIndex++;
    await onBatch?.(current.slice(), batchIndex, isLast);
    current.length = 0;
    currentBytes = 0;
  };

  try {
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      // Checked right after rendering; a failed page is retried at half the
      // resolution, then stops the run (PageConversionError), never skipped.
      const blob = await renderCheckedPage(i + 1, format, async (resolution) => {
        const doc = await getDoc(job.sourceFileId);
        const page = await doc.getPage(job.sourcePageIndex + 1);
        return renderPage(page, {
          scale,
          resolution,
          rotation: job.rotation,
          format,
          quality,
        });
      });
      current.push({ name: names[i], blob });
      currentBytes += blob.size;
      onProgress?.(Math.round(((i + 1) / total) * 100));

      // Mirror planBatches(): flush once the running output reaches the target
      // and pages still remain (so the final partial batch is never split early).
      const pagesRemaining = jobs.length - 1 - i;
      if (shouldFlush(currentBytes, batchByteTarget, pagesRemaining)) {
        streaming = true;
        await flush(false);
      }
    }
  } finally {
    for (const doc of docCache.values()) doc.destroy();
  }

  if (streaming) {
    if (current.length > 0) await flush(true);
    return { mode: "streamed", imageCount: jobs.length, batchCount: batchIndex };
  }

  return { mode: "preview", images: current };
}
