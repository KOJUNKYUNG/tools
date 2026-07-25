"use client";

import { useEffect, useRef, useState } from "react";
import { StampIcon } from "lucide-react";
import { getPdfjsLib, pdfjsDocParams } from "@/lib/pdf/pdfjs";
import { formatPageNumber } from "@/lib/pdf/pageNumberFormat";
import {
  resolveNumberCenter,
  computeTilePositions,
  scaledTileGaps,
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
  /** Number mode: dragging the number on the preview reports a normalized
   *  top-left position (0..1). */
  onPositionChange?: (pos: { x: number; y: number }) => void;
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
  onPositionChange,
}: PdfWatermarkPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Number-mode hit box (canvas-internal coords) for drag hit-testing.
  const overlayBoxRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const draggingRef = useRef(false);
  const [cursor, setCursor] = useState<"grab" | "grabbing" | "default">("default");
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
      const center = resolveNumberCenter({
        grid: pageOpts.grid,
        position: pageOpts.position,
        pageW,
        pageH,
        boxW: box.width,
        boxH: box.height,
        margin: pageOpts.margin * s,
      });
      const cornerX = center.x - box.width / 2;
      const topY = pageH - center.y - box.height / 2; // visual center → canvas top-left of box
      ctx.fillStyle = pageOpts.color;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(text, cornerX + box.pad, topY + box.pad + box.ascent);
      overlayBoxRef.current = { x: cornerX, y: topY, w: box.width, h: box.height };
      return;
    }
    overlayBoxRef.current = null;

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

    const tileGaps = scaledTileGaps(drawW, drawH, wmOpts.tileGap);
    const centers: Point[] = wmOpts.tile
      ? computeTilePositions(pageW, pageH, drawW, drawH, tileGaps.gapX, tileGaps.gapY)
      : [
          resolveNumberCenter({
            grid: wmOpts.grid,
            position: wmOpts.position,
            pageW,
            pageH,
            boxW: drawW,
            boxH: drawH,
            margin: wmOpts.margin * s,
          }),
        ];
    for (const c of centers) paint(c.x, c.y);
    ctx.globalAlpha = 1;
    // A single (non-tiled) watermark is draggable — store its hit box (the
    // axis-aligned box around the center; rotation is ignored for hit-testing).
    if (!wmOpts.tile) {
      const c = centers[0];
      overlayBoxRef.current = {
        x: c.x - drawW / 2,
        y: pageH - c.y - drawH / 2,
        w: drawW,
        h: drawH,
      };
    }
  }

  const showPlaceholder = !file || (!pageCanvasRef.current && analyzing);

  // A single overlay is draggable: the page number, or a non-tiled watermark.
  const draggable =
    !!onPositionChange && (mode === "number" || (mode === "watermark" && !wmOpts.tile));

  // Map a pointer event to normalized (0..1) + canvas-internal coords.
  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    return { nx, ny, cx: nx * canvas.width, cy: ny * canvas.height };
  }

  function hitOverlay(cx: number, cy: number) {
    const b = overlayBoxRef.current;
    if (!b) return false;
    const pad = 12;
    return cx >= b.x - pad && cx <= b.x + b.w + pad && cy >= b.y - pad && cy <= b.y + b.h + pad;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!draggable) return;
    const p = canvasPoint(e);
    if (!p || !hitOverlay(p.cx, p.cy)) return;
    draggingRef.current = true;
    setCursor("grabbing");
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!draggable) return;
    const p = canvasPoint(e);
    if (!p) return;
    if (draggingRef.current && onPositionChange) {
      onPositionChange({
        x: Math.min(1, Math.max(0, p.nx)),
        y: Math.min(1, Math.max(0, p.ny)),
      });
      return;
    }
    setCursor(hitOverlay(p.cx, p.cy) ? "grab" : "default");
  }

  function endDrag(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setCursor("default");
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }

  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden rounded-[8px]"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
        style={{ cursor: draggable ? cursor : "default", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      />
      {showPlaceholder && (
        <div className="absolute inset-0 grid place-items-center px-4 text-center">
          {analyzing ? (
            <span className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
              {labels.analyzingHint}
            </span>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <StampIcon className="size-8" style={{ color: "var(--ink-soft)" }} />
              <span className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
                {labels.previewUnavailable}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
