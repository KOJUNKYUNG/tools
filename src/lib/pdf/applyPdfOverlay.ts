import { PDFDocument, degrees } from "pdf-lib";
import { getPdfjsLib, pdfjsDocParams } from "./pdfjs";
import { parseRange } from "@/lib/common/pageRange";
import { formatPageNumber, type PageNumberFormat } from "./pageNumberFormat";
import {
  computeAnchor,
  computeTilePositions,
  cornerForCenter,
  clampOpacity,
  degToRad,
  type GridPosition,
  type Point,
} from "./overlayLayout";
import { renderTextToPng } from "./renderTextToPng";

// ─────────────────────────────────────────────────────────────────────────
// Public option types (shared with the UI). Page numbers and watermarks share
// one tool but are distinct modes; the discriminated union keeps each mode's
// controls type-safe.
// ─────────────────────────────────────────────────────────────────────────

export type LogoKind = "png" | "jpg";
export interface LogoInput {
  bytes: Uint8Array;
  kind: LogoKind;
}

export interface PageNumberOptions {
  mode: "number";
  format: PageNumberFormat;
  start: number;
  grid: GridPosition;
  fontPx: number;
  color: string;
  margin: number;
  /** 1-based range like "1,3,5-7". Empty = every page. */
  rangeInput: string;
}

export interface WatermarkOptions {
  mode: "watermark";
  source: "text" | "image";
  text: string;
  fontPx: number;
  color: string;
  logo: LogoInput | null;
  /** Logo target width as a fraction of page width (0.05–1). */
  logoScale: number;
  opacity: number;
  /** Rotation in degrees (e.g. 45 for a diagonal watermark). */
  angle: number;
  /** Repeat across the whole page on a grid. */
  tile: boolean;
  /** Anchor used when not tiling. */
  grid: GridPosition;
  margin: number;
  rangeInput: string;
}

export type OverlayOptions = PageNumberOptions | WatermarkOptions;

export interface ApplyResult {
  data: Uint8Array;
  pageCount: number;
  appliedPages: number;
}

export interface PdfOverlayAnalysis {
  numPages: number;
  firstPageWidth: number;
  firstPageHeight: number;
}

// ─────────────────────────────────────────────────────────────────────────

/** pdfjs read for the preview + range max: page count and first page size. */
export async function analyzePdfForOverlay(
  file: File,
): Promise<PdfOverlayAnalysis> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdfjsLib = await getPdfjsLib();
  // slice() → fresh buffer pdfjs may detach without harming callers.
  const doc = await pdfjsLib.getDocument({ data: bytes.slice(), ...pdfjsDocParams })
    .promise;
  try {
    const numPages = doc.numPages;
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    return { numPages, firstPageWidth: vp.width, firstPageHeight: vp.height };
  } finally {
    doc.destroy();
  }
}

function tileCenters(pw: number, ph: number, w: number, h: number): Point[] {
  const gapX = Math.max(w * 0.6, 60);
  const gapY = Math.max(h * 3, 120);
  // The grid points double as tile CENTERS; edge tiles clip naturally.
  return computeTilePositions(pw, ph, w, h, gapX, gapY);
}

/**
 * Draw page numbers or a watermark onto a PDF and return new bytes.
 *
 *   load → build overlay PNG(s) → draw per page in range → save → integrity.
 *
 * Korean text is rasterized via renderTextToPng (canvas + loaded Pretendard),
 * so there is no font embedding and no glyph-subsetting corruption risk. A
 * post-save reopen guards against a silently broken output.
 */
export async function applyOverlay({
  file,
  options,
  onProgress,
}: {
  file: File;
  options: OverlayOptions;
  onProgress?: (pct: number) => void;
}): Promise<ApplyResult> {
  onProgress?.(5);
  const bytes = new Uint8Array(await file.arrayBuffer());

  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(bytes);
  } catch {
    throw new Error(
      "PDF를 열 수 없습니다. 암호화되었거나 손상된 파일일 수 있습니다.",
    );
  }

  const pages = pdf.getPages();
  const total = pages.length;
  if (total === 0) throw new Error("CORRUPT_OUTPUT: PDF에 페이지가 없습니다.");

  const range = options.rangeInput.trim()
    ? parseRange(options.rangeInput, total)
    : null; // null = all pages
  const inRange = (i: number) => (range ? range.has(i + 1) : true);

  onProgress?.(15);
  let applied = 0;

  if (options.mode === "number") {
    // One embedded PNG per distinct label string (e.g. "1 / 10" differs per page,
    // but "page" prefixes / repeated strings are cached).
    const cache = new Map<
      string,
      { img: Awaited<ReturnType<PDFDocument["embedPng"]>>; w: number; h: number }
    >();

    for (let i = 0; i < total; i++) {
      if (inRange(i)) {
        const text = formatPageNumber({
          index: i,
          total,
          start: options.start,
          format: options.format,
        });
        let entry = cache.get(text);
        if (!entry) {
          const r = await renderTextToPng({
            text,
            fontPx: options.fontPx,
            color: options.color,
          });
          const img = await pdf.embedPng(r.bytes);
          entry = { img, w: r.width, h: r.height };
          cache.set(text, entry);
        }
        const page = pages[i];
        const { width: pw, height: ph } = page.getSize();
        const { x, y } = computeAnchor(
          options.grid,
          pw,
          ph,
          entry.w,
          entry.h,
          options.margin,
        );
        page.drawImage(entry.img, { x, y, width: entry.w, height: entry.h });
        applied++;
      }
      onProgress?.(15 + Math.round(((i + 1) / total) * 72));
    }
  } else {
    // Build the watermark image once, reuse on every page.
    let img: Awaited<ReturnType<PDFDocument["embedPng"]>>;
    let baseW: number;
    let baseH: number;

    if (options.source === "image") {
      if (!options.logo) throw new Error("로고 이미지를 선택하세요.");
      img =
        options.logo.kind === "png"
          ? await pdf.embedPng(options.logo.bytes)
          : await pdf.embedJpg(options.logo.bytes);
      const dim = img.scale(1);
      baseW = dim.width;
      baseH = dim.height;
    } else {
      if (!options.text.trim()) throw new Error("워터마크 텍스트를 입력하세요.");
      const r = await renderTextToPng({
        text: options.text,
        fontPx: options.fontPx,
        color: options.color,
      });
      img = await pdf.embedPng(r.bytes);
      baseW = r.width;
      baseH = r.height;
    }

    const opacity = clampOpacity(options.opacity);
    const rot = degToRad(options.angle);

    for (let i = 0; i < total; i++) {
      if (inRange(i)) {
        const page = pages[i];
        const { width: pw, height: ph } = page.getSize();

        let drawW = baseW;
        let drawH = baseH;
        if (options.source === "image") {
          const frac = Math.min(1, Math.max(0.05, options.logoScale));
          drawW = pw * frac;
          drawH = (baseH / baseW) * drawW;
        }

        const centers = options.tile
          ? tileCenters(pw, ph, drawW, drawH)
          : [
              (() => {
                const corner = computeAnchor(
                  options.grid,
                  pw,
                  ph,
                  drawW,
                  drawH,
                  options.margin,
                );
                return { x: corner.x + drawW / 2, y: corner.y + drawH / 2 };
              })(),
            ];

        for (const c of centers) {
          const { x, y } = cornerForCenter(c.x, c.y, drawW, drawH, rot);
          page.drawImage(img, {
            x,
            y,
            width: drawW,
            height: drawH,
            opacity,
            rotate: degrees(options.angle),
          });
        }
        applied++;
      }
      onProgress?.(15 + Math.round(((i + 1) / total) * 72));
    }
  }

  onProgress?.(92);
  const out = await pdf.save();

  // Integrity: reopen and confirm the page count survived and bytes exist.
  if (out.length === 0) throw new Error("CORRUPT_OUTPUT: 빈 출력");
  const check = await PDFDocument.load(out);
  if (check.getPageCount() !== total) {
    throw new Error("CORRUPT_OUTPUT: 페이지 수가 변경되었습니다.");
  }

  onProgress?.(100);
  return { data: out, pageCount: total, appliedPages: applied };
}
