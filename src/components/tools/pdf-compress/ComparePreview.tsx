"use client";

import { getPdfjsLib, pdfjsDocParams } from "@/lib/pdf/pdfjs";

interface ComparePreviewProps {
  originalUrl: string | null;
  compressedUrl: string | null;
  showCompressed: boolean;
  loading?: boolean;
  onZoom?: () => void;
  zoomAria?: string;
}

export function ComparePreview({
  originalUrl,
  compressedUrl,
  showCompressed,
  loading,
  onZoom,
  zoomAria,
}: ComparePreviewProps) {
  const url = showCompressed && compressedUrl ? compressedUrl : originalUrl;
  const showCornerSpinner = loading && !!compressedUrl && showCompressed;
  const showCentreSpinner = !url;
  const zoomable = !!url && !!onZoom;

  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden rounded-[8px]"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      {url ? (
        zoomable ? (
          <button
            type="button"
            onClick={onZoom}
            aria-label={zoomAria}
            className="absolute inset-0 cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" draggable={false} className="absolute inset-0 m-auto max-h-full max-w-full object-contain" />
          </button>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" draggable={false} className="absolute inset-0 m-auto max-h-full max-w-full object-contain" />
        )
      ) : showCentreSpinner ? (
        <div className="absolute inset-0 grid place-items-center font-body text-[12px]" style={{ color: "var(--ink-soft)" }}>
          <span className="inline-block size-4 animate-spin rounded-full border-2 border-[color:var(--emphasis)] border-t-transparent" />
        </div>
      ) : null}

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
  const doc = await pdfjsLib.getDocument({ data: bytes, ...pdfjsDocParams }).promise;
  try {
    const page = await doc.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(targetWidth / baseViewport.width, maxScale);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    // Clamp to avoid OOM on huge pages; the zoom path passes a larger cap.
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
