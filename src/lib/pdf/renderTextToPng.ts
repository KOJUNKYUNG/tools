// Render text to a high-DPI PNG on an offscreen canvas. We use the app's
// already-loaded Pretendard (resolved from the --font-pretendard CSS variable),
// so Korean glyphs render correctly with ZERO font embedding and ZERO new
// dependency. The bitmap is SCALE× the logical size for print crispness; the
// returned width/height are LOGICAL (CSS px), which the caller uses 1:1 as PDF
// points (pdf-lib's user space is 72 DPI, so 1 px == 1 pt at scale 1).
//
// No node unit test: jsdom has no real canvas text engine. Verified by tsc +
// build + the user's visual /qa. All branchable geometry it feeds is unit
// tested in overlayLayout.ts / pageNumberFormat.ts.

const SCALE = 4;

export interface RenderedText {
  bytes: Uint8Array;
  /** Logical width in CSS px (== PDF points at scale 1). */
  width: number;
  /** Logical height in CSS px (== PDF points at scale 1). */
  height: number;
}

/** Resolve the app's Pretendard family from the CSS variable, with fallbacks. */
function resolveFontFamily(explicit?: string): string {
  if (explicit) return explicit;
  if (typeof document !== "undefined") {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-pretendard")
      .trim();
    if (v) return `${v}, system-ui, sans-serif`;
  }
  return "system-ui, sans-serif";
}

export interface RenderTextOptions {
  text: string;
  /** Font size in CSS px (used directly as PDF points). */
  fontPx: number;
  /** Any CSS color string. */
  color: string;
  fontFamily?: string;
  /** Transparent padding around the glyphs, in logical px. Default ~0.25em. */
  padding?: number;
}

export async function renderTextToPng({
  text,
  fontPx,
  color,
  fontFamily,
  padding,
}: RenderTextOptions): Promise<RenderedText> {
  // Wait for web fonts so the first render isn't the swap fallback (Korean
  // would otherwise fall back to a system font or tofu).
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const family = resolveFontFamily(fontFamily);
  const font = `${fontPx}px ${family}`;
  const pad = padding ?? Math.ceil(fontPx * 0.25);

  // Measure first on a throwaway context.
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  if (!mctx) throw new Error("Canvas 2D 컨텍스트를 만들 수 없습니다.");
  mctx.font = font;
  const metrics = mctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || fontPx * 0.8;
  const descent = metrics.actualBoundingBoxDescent || fontPx * 0.2;

  const logicalW = Math.max(1, Math.ceil(metrics.width + pad * 2));
  const logicalH = Math.max(1, Math.ceil(ascent + descent + pad * 2));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(logicalW * SCALE);
  canvas.height = Math.round(logicalH * SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D 컨텍스트를 만들 수 없습니다.");

  ctx.scale(SCALE, SCALE);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, pad, pad + ascent);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas → PNG 변환 실패"))),
      "image/png",
    );
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());

  // Release the backing store (OOM guard).
  canvas.width = 0;
  canvas.height = 0;

  return { bytes, width: logicalW, height: logicalH };
}
