import { PDFDocument, PDFImage, PDFPage, degrees } from "pdf-lib";
import { getPdfjsLib, pdfjsDocParams } from "./pdfjs";
import { formatPageNumber, type PageNumberFormat } from "./pageNumberFormat";
import {
  computeTilePositions,
  cornerForCenter,
  scaledTileGaps,
  resolveNumberCenter,
  visualSize,
  visualPointToUser,
  normalizeRotation,
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
  /** Unit suffix for the "ko" format, locale-resolved ("쪽" / "p"). */
  suffix: string;
  start: number;
  grid: GridPosition;
  fontPx: number;
  color: string;
  margin: number;
  /** Normalized CENTER (0..1, top-left origin) for free placement, or null to
   *  use the `grid` anchor + margin. */
  position: { x: number; y: number } | null;
  /** Explicit 1-based pages to apply to. */
  pages: number[];
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
  /** Spacing multiplier between tiled repeats (0.5–3.0; 1 = default). */
  tileGap: number;
  /** Anchor used when not tiling. */
  grid: GridPosition;
  margin: number;
  /** Normalized CENTER (0..1, top-left origin) for free placement when not
   *  tiling, or null to use the `grid` anchor + margin. */
  position: { x: number; y: number } | null;
  /** Explicit 1-based pages to apply to. */
  pages: number[];
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

function tileCenters(
  pw: number,
  ph: number,
  w: number,
  h: number,
  gapMult: number,
): Point[] {
  const { gapX, gapY } = scaledTileGaps(w, h, gapMult);
  // The grid points double as tile CENTERS; edge tiles clip naturally.
  return computeTilePositions(pw, ph, w, h, gapX, gapY);
}

interface DrawOpts {
  grid: GridPosition;
  margin: number;
  tile: boolean;
  /** Tile-gap multiplier (only used when tiling). */
  tileGap: number;
  /** Free normalized center (top-left origin) for a non-tiled overlay, or null. */
  position: { x: number; y: number } | null;
  /** Desired VISUAL angle in degrees (0 = upright as the user sees it). */
  angleDeg: number;
  opacity: number;
}

/**
 * Draw an embedded image onto a page, honoring the page's `/Rotate`. We place
 * the overlay in the upright "visual" space (so it lands where the user sees
 * it), then map the point into user space and add the page rotation to the
 * draw angle so it renders upright after the viewer rotates the page.
 */
function drawOverlayOnPage(
  page: PDFPage,
  img: PDFImage,
  dw: number,
  dh: number,
  opts: DrawOpts,
): void {
  const { width: W, height: H } = page.getSize();
  const rotation = normalizeRotation(page.getRotation().angle);
  const { vw, vh } = visualSize(rotation, W, H);

  const centersV: Point[] = opts.tile
    ? tileCenters(vw, vh, dw, dh, opts.tileGap)
    : [
        resolveNumberCenter({
          grid: opts.grid,
          position: opts.position,
          pageW: vw,
          pageH: vh,
          boxW: dw,
          boxH: dh,
          margin: opts.margin,
        }),
      ];

  const alphaDeg = opts.angleDeg + rotation;
  const alphaRad = degToRad(alphaDeg);

  for (const cv of centersV) {
    const cu = visualPointToUser(rotation, W, H, cv.x, cv.y);
    const corner = cornerForCenter(cu.x, cu.y, dw, dh, alphaRad);
    page.drawImage(img, {
      x: corner.x,
      y: corner.y,
      width: dw,
      height: dh,
      opacity: opts.opacity,
      rotate: degrees(alphaDeg),
    });
  }
}

/** Visual page width/height for an already-loaded page (for logo sizing). */
function visualPageSize(page: PDFPage): { vw: number; vh: number } {
  const { width, height } = page.getSize();
  return visualSize(normalizeRotation(page.getRotation().angle), width, height);
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
      "INVALID_INPUT: PDF를 열 수 없습니다. 암호화되었거나 손상된 파일일 수 있습니다.",
    );
  }

  const pages = pdf.getPages();
  const total = pages.length;
  if (total === 0) throw new Error("CORRUPT_OUTPUT: PDF에 페이지가 없습니다.");

  // Explicit 1-based page set (empty = nothing to do).
  const pageSet = new Set(options.pages);
  const inRange = (i: number) => pageSet.has(i + 1);

  // Nothing selected → return the ORIGINAL bytes untouched. Embedding a logo /
  // rendered text and re-saving would otherwise grow the file even though no
  // page changed (the 0-pages-applied size-bloat bug).
  const applicable = options.pages.filter((p) => p >= 1 && p <= total);
  if (applicable.length === 0) {
    onProgress?.(100);
    return { data: bytes, pageCount: total, appliedPages: 0 };
  }

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
          suffix: options.suffix,
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
        drawOverlayOnPage(pages[i], entry.img, entry.w, entry.h, {
          grid: options.grid,
          margin: options.margin,
          tile: false,
          tileGap: 1,
          position: options.position,
          angleDeg: 0,
          opacity: 1,
        });
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

    for (let i = 0; i < total; i++) {
      if (inRange(i)) {
        const page = pages[i];

        let drawW = baseW;
        let drawH = baseH;
        if (options.source === "image") {
          // Logo size is a fraction of the VISUAL page width (what the user
          // sees); clamp to the visual height so a tall logo never overflows.
          const { vw, vh } = visualPageSize(page);
          const frac = Math.min(1, Math.max(0.05, options.logoScale));
          drawW = vw * frac;
          drawH = (baseH / baseW) * drawW;
          if (drawH > vh) {
            drawH = vh;
            drawW = (baseW / baseH) * drawH;
          }
        }

        drawOverlayOnPage(page, img, drawW, drawH, {
          grid: options.grid,
          margin: options.margin,
          tile: options.tile,
          tileGap: options.tileGap,
          position: options.tile ? null : options.position,
          angleDeg: options.angle,
          opacity,
        });
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
