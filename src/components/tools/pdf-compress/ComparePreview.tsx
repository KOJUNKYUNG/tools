"use client";

import { getPdfjsLib, pdfjsDocParams } from "@/lib/pdf/pdfjs";

interface ComparePreviewProps {
  /** Original PDF page-1 preview URL (always available once the file is loaded). */
  originalUrl: string | null;
  /** Compressed PDF page-1 preview URL (only in "done" state). */
  compressedUrl: string | null;
  /** Whether to show the original/compressed toggle. */
  showToggle: boolean;
  /** Whether the compressed preview is currently shown (vs original). */
  showCompressed: boolean;
  onToggle: (showCompressed: boolean) => void;
  labels: {
    compareOriginal: string;
    compareCompressed: string;
    compareToggleAria: string;
  };
}

export function ComparePreview({
  originalUrl,
  compressedUrl,
  showToggle,
  showCompressed,
  onToggle,
  labels,
}: ComparePreviewProps) {
  const url =
    showToggle && showCompressed && compressedUrl ? compressedUrl : originalUrl;

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Toggle slot — reserved space so the frame does not shift between idle/done */}
      <div className="flex h-7 items-center justify-end">
        {showToggle && compressedUrl ? (
          <label
            className="inline-flex cursor-pointer items-center gap-1.5 font-display text-[11px]"
            style={{ color: "var(--ink-strong)" }}
          >
            <input
              type="checkbox"
              checked={showCompressed}
              onChange={(e) => onToggle(e.target.checked)}
              aria-label={labels.compareToggleAria}
              style={{ accentColor: "var(--accent-electric)" }}
            />
            <span style={{ color: "var(--ink-soft)" }}>
              {labels.compareOriginal}
            </span>
            <span>/</span>
            <span>{labels.compareCompressed}</span>
          </label>
        ) : null}
      </div>

      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-[8px]"
        style={{
          background: "var(--silver-100)",
          border: "1px solid var(--silver-200)",
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            draggable={false}
            className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
          />
        ) : (
          <div
            className="absolute inset-0 grid place-items-center font-body text-[12px]"
            style={{ color: "var(--ink-soft)" }}
          >
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-[color:var(--accent-electric)] border-t-transparent" />
          </div>
        )}
      </div>
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
): Promise<Blob> {
  const pdfjsLib = await getPdfjsLib();
  const doc = await pdfjsLib.getDocument({ data: bytes, ...pdfjsDocParams })
    .promise;
  try {
    const page = await doc.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(targetWidth / baseViewport.width, 2);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    // Clamp to avoid OOM on huge pages (pitfall: pdf-to-image F1).
    canvas.width = Math.min(Math.ceil(viewport.width), 2400);
    canvas.height = Math.min(Math.ceil(viewport.height), 2400);
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
