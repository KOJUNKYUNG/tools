"use client";

import { useEffect, useRef, useState } from "react";
import { StampIcon } from "lucide-react";
import { getPdfjsLib, pdfjsDocParams } from "@/lib/pdf/pdfjs";
import { formatPageNumber } from "@/lib/pdf/pageNumberFormat";
import {
  computeAnchor,
  computeTilePositions,
  defaultTileGaps,
  clampOpacity,
  degToRad,
  type Point,
} from "@/lib/pdf/overlayLayout";
import type { WatermarkMode } from "@/lib/pdf/watermarkNaming";
import type { PageNumberState } from "./PageNumberControls";
import type { WatermarkState } from "./WatermarkControls";
import type { PdfWatermarkLabels } from "./labels";

interface PdfWatermarkPreviewProps {
  file: File | null;
  mode: WatermarkMode;
  pageOpts: PageNumberState;
  wmOpts: WatermarkState;
  analysis: { numPages: number; firstPageWidth: number; firstPageHeight: number } | null;
  analyzing: boolean;
  labels: PdfWatermarkLabels;
}

const PREVIEW_TARGET_W = 560;

function resolveFamily(): string {
  if (typeof document !== "undefined") {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-pretendard")
      .trim();
    if (v) return `${v}, system-ui, sans-serif`;
  }
  return "system-ui, sans-serif";
}

// Mirror renderTextToPng's box math so preview placement matches the export.
function measureBox(ctx: CanvasRenderingContext2D, text: string, fontPx: number) {
  const pad = Math.ceil(fontPx * 0.25);
  const m = ctx.measureText(text);
  const ascent = m.actualBoundingBoxAscent || fontPx * 0.8;
  const descent = m.actualBoundingBoxDescent || fontPx * 0.2;
  return {
    pad,
    ascent,
    width: Math.max(1, Math.ceil(m.width + pad * 2)),
    height: Math.max(1, Math.ceil(ascent + descent + pad * 2)),
  };
}

export function PdfWatermarkPreview({
  file,
  mode,
  pageOpts,
  wmOpts,
  analysis,
  analyzing,
  labels,
}: PdfWatermarkPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const logoBitmapRef = useRef<ImageBitmap | null>(null);
  const renderTokenRef = useRef(0);
  // Bumped when the page bitmap / logo bitmap become ready, so the compositing
  // effect re-runs with a FRESH closure (latest `analysis`). Calling draw()
  // directly from the async render would use a stale closure — the first-upload
  // blank-preview bug, where analysis resolved after the page render captured
  // analysis=null.
  const [pageTick, setPageTick] = useState(0);
  const [logoTick, setLogoTick] = useState(0);

  // Render page 1 to an offscreen canvas whenever the file changes.
  useEffect(() => {
    if (!file) {
      pageCanvasRef.current = null;
      return;
    }
    let cancelled = false;
    const token = ++renderTokenRef.current;
    (async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const pdfjsLib = await getPdfjsLib();
        const doc = await pdfjsLib.getDocument({ data: bytes.slice(), ...pdfjsDocParams }).promise;
        try {
          const page = await doc.getPage(1);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(PREVIEW_TARGET_W / base.width, 2);
          const viewport = page.getViewport({ scale });
          const c = document.createElement("canvas");
          c.width = Math.min(Math.ceil(viewport.width), 2000);
          c.height = Math.min(Math.ceil(viewport.height), 2000);
          await page.render({ canvas: c, viewport }).promise;
          if (cancelled || token !== renderTokenRef.current) return;
          pageCanvasRef.current = c;
          setPageTick((t) => t + 1);
        } finally {
          void doc.destroy();
        }
      } catch {
        if (!cancelled) pageCanvasRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Decode the logo to a bitmap when it changes.
  useEffect(() => {
    const logo = wmOpts.logo;
    if (!logo) {
      logoBitmapRef.current?.close();
      logoBitmapRef.current = null;
      setLogoTick((t) => t + 1);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const blob = new Blob([new Uint8Array(logo.bytes)], {
          type: logo.kind === "png" ? "image/png" : "image/jpeg",
        });
        const bmp = await createImageBitmap(blob);
        if (cancelled) {
          bmp.close();
          return;
        }
        // Release the previous bitmap (GPU-backed) before swapping in the new one.
        logoBitmapRef.current?.close();
        logoBitmapRef.current = bmp;
        setLogoTick((t) => t + 1);
      } catch {
        if (!cancelled) logoBitmapRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wmOpts.logo]);

  // Release the logo bitmap on unmount.
  useEffect(
    () => () => {
      logoBitmapRef.current?.close();
      logoBitmapRef.current = null;
    },
    [],
  );

  // Re-composite whenever any option changes OR a bitmap becomes ready.
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pageOpts, wmOpts, analysis, pageTick, logoTick]);

  function draw() {
    const canvas = canvasRef.current;
    const pageCanvas = pageCanvasRef.current;
    if (!canvas || !pageCanvas || !analysis) return;
    canvas.width = pageCanvas.width;
    canvas.height = pageCanvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = canvas.width / analysis.firstPageWidth;
    const pageW = canvas.width;
    const pageH = canvas.height;
    const family = resolveFamily();

    ctx.clearRect(0, 0, pageW, pageH);
    ctx.drawImage(pageCanvas, 0, 0);

    if (mode === "number") {
      const text = formatPageNumber({
        index: 0,
        total: analysis.numPages,
        start: pageOpts.start,
        format: pageOpts.format,
        suffix: labels.pageUnitSuffix,
      });
      const fpx = pageOpts.fontPx * s;
      ctx.font = `${fpx}px ${family}`;
      const box = measureBox(ctx, text, fpx);
      const corner = computeAnchor(pageOpts.grid, pageW, pageH, box.width, box.height, pageOpts.margin * s);
      const topY = pageH - corner.y - box.height; // bottom-left origin → canvas top-left
      ctx.fillStyle = pageOpts.color;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(text, corner.x + box.pad, topY + box.pad + box.ascent);
      return;
    }

    // watermark
    ctx.globalAlpha = clampOpacity(wmOpts.opacity);
    const rot = degToRad(wmOpts.angle);

    let drawW: number;
    let drawH: number;
    const paint = (cx: number, cy: number) => {
      const cyTop = pageH - cy; // center y in canvas space
      ctx.save();
      ctx.translate(cx, cyTop);
      ctx.rotate(-rot); // pdf rotates CCW; canvas y-down → negate to match
      if (wmOpts.source === "image" && logoBitmapRef.current) {
        ctx.drawImage(logoBitmapRef.current, -drawW / 2, -drawH / 2, drawW, drawH);
      } else if (wmOpts.source === "text") {
        ctx.fillStyle = wmOpts.color;
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillText(wmOpts.text, 0, 0);
      }
      ctx.restore();
    };

    if (wmOpts.source === "image") {
      const bmp = logoBitmapRef.current;
      if (!bmp) {
        ctx.globalAlpha = 1;
        return;
      }
      const frac = Math.min(1, Math.max(0.05, wmOpts.logoScale));
      drawW = pageW * frac;
      drawH = (bmp.height / bmp.width) * drawW;
    } else {
      if (!wmOpts.text.trim()) {
        ctx.globalAlpha = 1;
        return;
      }
      const fpx = wmOpts.fontPx * s;
      ctx.font = `${fpx}px ${family}`;
      const box = measureBox(ctx, wmOpts.text, fpx);
      drawW = box.width;
      drawH = box.height;
    }

    const tileGaps = defaultTileGaps(drawW, drawH);
    const centers: Point[] = wmOpts.tile
      ? computeTilePositions(pageW, pageH, drawW, drawH, tileGaps.gapX, tileGaps.gapY)
      : [
          (() => {
            const corner = computeAnchor(wmOpts.grid, pageW, pageH, drawW, drawH, wmOpts.margin * s);
            return { x: corner.x + drawW / 2, y: corner.y + drawH / 2 };
          })(),
        ];
    for (const c of centers) paint(c.x, c.y);
    ctx.globalAlpha = 1;
  }

  const showPlaceholder = !file || (!pageCanvasRef.current && analyzing);

  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden rounded-[8px]"
      style={{ background: "var(--silver-100)", border: "1px solid var(--silver-200)" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
      />
      {showPlaceholder && (
        <div className="absolute inset-0 grid place-items-center px-4 text-center">
          {analyzing ? (
            <span className="font-body text-[11.5px]" style={{ color: "var(--silver-600)" }}>
              {labels.analyzingHint}
            </span>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <StampIcon className="size-8" style={{ color: "var(--silver-500)" }} />
              <span className="font-body text-[11px]" style={{ color: "var(--silver-600)" }}>
                {labels.previewUnavailable}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
