"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

interface ImageCompressPreviewProps {
  fileName: string;
  totalCount: number;
  currentIndex: number;
  imageUrl: string | null;
  onPrev: () => void;
  onNext: () => void;
  prevAria: string;
  nextAria: string;
  showCompressed: boolean;
  onToggleCompressed: (checked: boolean) => void;
  compareLabel: string;
  /**
   * True while the compressed preview/estimate is being recomputed (format or
   * quality changed). Shows a corner spinner over the compressed view so the
   * still-visible previous render doesn't read as the confirmed result.
   */
  updating?: boolean;
}

export function ImageCompressPreview({
  fileName,
  totalCount,
  currentIndex,
  imageUrl,
  onPrev,
  onNext,
  prevAria,
  nextAria,
  showCompressed,
  onToggleCompressed,
  compareLabel,
  updating = false,
}: ImageCompressPreviewProps) {
  const multi = totalCount > 1;
  // Corner badge only when re-rendering the compressed view that's on screen —
  // mirrors pdf-compress's ComparePreview treatment.
  const showCornerSpinner = updating && showCompressed && !!imageUrl;
  return (
    <div className="space-y-3">
      <div
        className="relative aspect-[4/3] w-full overflow-hidden rounded-[8px] border"
        style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt={fileName}
            className="absolute inset-0 size-full object-contain"
          />
        )}
        {showCornerSpinner && (
          <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-[color:var(--surface)] p-1 opacity-80 shadow-sm">
            <span className="block size-3 animate-spin rounded-full border-2 border-[color:var(--emphasis)] border-t-transparent" />
          </div>
        )}
      </div>

      <div className="relative flex min-h-[28px] items-center justify-center gap-3">
        {multi && (
          <>
            <button
              type="button"
              onClick={onPrev}
              disabled={currentIndex === 0}
              aria-label={prevAria}
              className="rounded-[5px] border p-1 transition-colors hover:border-[color:var(--emphasis)] disabled:opacity-40"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border)",
                color: "var(--ink-strong)",
              }}
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <span
              className="font-mono text-[11px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {currentIndex + 1}/{totalCount}
            </span>
            <button
              type="button"
              onClick={onNext}
              disabled={currentIndex === totalCount - 1}
              aria-label={nextAria}
              className="rounded-[5px] border p-1 transition-colors hover:border-[color:var(--emphasis)] disabled:opacity-40"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border)",
                color: "var(--ink-strong)",
              }}
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </>
        )}
        <label
          className="absolute right-0 inline-flex cursor-pointer select-none items-center gap-1.5 font-body text-[11px]"
          style={{ color: "var(--ink-soft)" }}
        >
          {compareLabel}
          <input
            type="checkbox"
            checked={showCompressed}
            onChange={(e) => onToggleCompressed(e.target.checked)}
            style={{ accentColor: "var(--emphasis)" }}
          />
        </label>
      </div>
    </div>
  );
}
