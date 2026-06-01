"use client";

import { useEffect, useRef, useState } from "react";
import { LockIcon } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { getPdfjsLib, pdfjsDocParams } from "@/lib/pdf/pdfjs";
import type { PdfLockLabels } from "./labels";

interface PdfLockPreviewProps {
  file: File;
  /** null = still detecting; true = encrypted (no preview); false = render p1. */
  encrypted: boolean | null;
  labels: PdfLockLabels;
}

const PREVIEW_TARGET_W = 480;

/**
 * Left-pane preview. For an UNENCRYPTED PDF we render page 1 with pdfjs (reusing
 * the self-hosted worker config). For an ENCRYPTED PDF — or while detection is
 * pending — we show a lock glyph and a note, since a locked document has no
 * meaningful preview.
 */
export function PdfLockPreview({ file, encrypted, labels }: PdfLockPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Reset render state inside the async flow (setState directly in the
      // effect body is disallowed by react-hooks/set-state-in-effect).
      setRendered(false);
      setFailed(false);
      // Only render a preview for confirmed-plain PDFs.
      if (encrypted !== false) return;
      // Hold the doc outside try so the finally can always destroy it — on
      // success, on a render throw, AND on cancel (rapid re-upload). Without
      // this, each cancelled in-flight render leaks a pdfjs doc + worker.
      let doc: PDFDocumentProxy | null = null;
      try {
        const pdfjs = await getPdfjsLib();
        const bytes = new Uint8Array(await file.arrayBuffer());
        doc = await pdfjs.getDocument({ data: bytes, ...pdfjsDocParams }).promise;
        const page = await doc.getPage(1);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        const scale = PREVIEW_TARGET_W / viewport.width;
        const scaled = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.ceil(scaled.width);
        canvas.height = Math.ceil(scaled.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;
        if (cancelled) return;
        setRendered(true);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        doc?.destroy();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, encrypted]);

  const showLock = encrypted !== false || failed;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden rounded-[8px] border px-6 text-center"
      style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
    >
      {showLock ? (
        <>
          <LockIcon className="size-12" style={{ color: "var(--ink-soft)", opacity: 0.5 }} />
          <p className="font-body text-[12px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
            {encrypted ? labels.previewEncrypted : labels.previewNote}
          </p>
        </>
      ) : (
        <canvas
          ref={canvasRef}
          className="max-h-full max-w-full rounded-[4px]"
          style={{
            boxShadow: "0 2px 8px rgba(20,30,60,0.18)",
            opacity: rendered ? 1 : 0,
            transition: "opacity 0.2s",
          }}
        />
      )}
    </div>
  );
}
