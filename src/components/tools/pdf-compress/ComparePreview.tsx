"use client";

import { useState } from "react";
import { getPdfjsLib, pdfjsDocParams } from "@/lib/pdf/pdfjs";

interface ComparePreviewProps {
  /** Original PDF page-1 preview URL (placeholder until the compressed one loads). */
  originalUrl: string | null;
  /** Compressed PDF page-1 preview URL (live preview in idle, real result in done). */
  compressedUrl: string | null;
  /** True while a new compressed preview is being generated. */
  loading?: boolean;
  /** Accessible label for the click-to-zoom frame. */
  zoomAria?: string;
}

// Click-to-zoom steps. Index 0 = fit-to-frame (1×). Each click steps up and
// zooms toward the clicked point; the final click wraps back to fit — i.e. up
// to three magnifications, then one more click returns to the original size.
const ZOOM_SCALES = [1, 2, 3, 4];

export function ComparePreview({
  originalUrl,
  compressedUrl,
  loading,
  zoomAria,
}: ComparePreviewProps) {
  // Always prefer the compressed page; fall back to the original as a
  // placeholder while the live compressed preview is still computing.
  const url = compressedUrl ?? originalUrl;
  const showCornerSpinner = loading && !!compressedUrl;
  const showCentreSpinner = !url;

  const [zoomIndex, setZoomIndex] = useState(0);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [prevUrl, setPrevUrl] = useState(url);

  // Reset zoom when the shown image changes (new preset / file / result).
  // React's adjust-state-during-render pattern — cheaper than an effect and
  // avoids a flash of the previous zoom on the new image.
  if (url !== prevUrl) {
    setPrevUrl(url);
    setZoomIndex(0);
    setOrigin({ x: 50, y: 50 });
  }

  const scale = ZOOM_SCALES[zoomIndex];
  const atMaxZoom = zoomIndex === ZOOM_SCALES.length - 1;

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const next = (zoomIndex + 1) % ZOOM_SCALES.length;
    // On reset (wrap to fit), recentre; otherwise zoom toward the click point.
    setOrigin(next === 0 ? { x: 50, y: 50 } : { x, y });
    setZoomIndex(next);
  }

  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden rounded-[8px]"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      {url ? (
        <button
          type="button"
          onClick={handleClick}
          aria-label={zoomAria}
          className="absolute inset-0"
          style={{ cursor: atMaxZoom ? "zoom-out" : "zoom-in" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            draggable={false}
            className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: `${origin.x}% ${origin.y}%`,
              transition: "transform 0.2s ease",
            }}
          />
        </button>
      ) : showCentreSpinner ? (
        <div
          className="absolute inset-0 grid place-items-center font-body text-[12px]"
          style={{ color: "var(--ink-soft)" }}
        >
          <span className="inline-block size-4 animate-spin rounded-full border-2 border-[color:var(--emphasis)] border-t-transparent" />
        </div>
      ) : null}

      {/* Corner badge: shown when updating an existing compressed preview */}
      {showCornerSpinner && (
        <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-[color:var(--surface)] p-1 shadow-sm opacity-80">
          <span className="block size-3 animate-spin rounded-full border-2 border-[color:var(--emphasis)] border-t-transparent" />
        </div>
      )}
    </div>
  );
}

/**
 * Render page 1 of a PDF to a JPEG blob via pdfjs.
 *
 * IMPORTANT — pitfall i (pdfjs ArrayBuffer detach):
 * pdfjs transfers `data` to its worker and detaches the original buffer.
 * The caller MUST pass a `bytes.slice()` copy when the source bytes are
 * reused elsewhere (the uploaded `File` is read again on compression; the
 * WASM `result.data` is reused for download).
 */
export async function renderPdfFirstPage(
  bytes: Uint8Array,
  targetWidth = 600,
  maxScale = 2,
): Promise<Blob> {
  const pdfjsLib = await getPdfjsLib();
  const doc = await pdfjsLib.getDocument({ data: bytes, ...pdfjsDocParams })
    .promise;
  try {
    const page = await doc.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(targetWidth / baseViewport.width, maxScale);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    // Clamp to avoid OOM on huge pages; the higher-res preview passes a larger cap.
    const MAX_CANVAS = 4096;
    canvas.width = Math.min(Math.ceil(viewport.width), MAX_CANVAS);
    canvas.height = Math.min(Math.ceil(viewport.height), MAX_CANVAS);
    await page.render({ canvas, viewport }).promise;
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
        "image/jpeg",
        0.85,
      );
    });
  } finally {
    void doc.destroy();
  }
}
