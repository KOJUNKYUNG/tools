"use client";

import { getPdfjsLib, pdfjsDocParams } from "@/lib/pdf/pdfjs";

interface ComparePreviewProps {
  /** Original PDF page-1 preview URL (always available once the file is loaded). */
  originalUrl: string | null;
  /** Compressed PDF page-1 preview URL (available in "done" state or as a live preview). */
  compressedUrl: string | null;
  /** Whether the compressed preview is currently shown (vs original). */
  showCompressed: boolean;
  /**
   * When true, a small spinning indicator is shown in the top-right corner
   * to signal that a new compressed preview is being generated.
   * If `compressedUrl` is not yet available, the spinner replaces the frame content.
   * If a previous preview already exists, it stays visible with a subtle badge.
   */
  loading?: boolean;
}

export function ComparePreview({
  originalUrl,
  compressedUrl,
  showCompressed,
  loading,
}: ComparePreviewProps) {
  const url =
    showCompressed && compressedUrl ? compressedUrl : originalUrl;

  // Show a corner badge when re-loading a compressed preview that already exists
  const showCornerSpinner = loading && !!compressedUrl && showCompressed;
  // Show centre spinner only on first-load (no compressed preview yet)
  const showCentreSpinner = !url;

  return (
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
      ) : showCentreSpinner ? (
        <div
          className="absolute inset-0 grid place-items-center font-body text-[12px]"
          style={{ color: "var(--ink-soft)" }}
        >
          <span className="inline-block size-4 animate-spin rounded-full border-2 border-[color:var(--accent-electric)] border-t-transparent" />
        </div>
      ) : null}

      {/* Corner badge: shown when updating an existing compressed preview */}
      {showCornerSpinner && (
        <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-[color:var(--surface)] p-1 shadow-sm opacity-80">
          <span className="block size-3 animate-spin rounded-full border-2 border-[color:var(--accent-electric)] border-t-transparent" />
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
