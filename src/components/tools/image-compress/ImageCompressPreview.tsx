"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { template } from "@/lib/common/template";

interface ImageCompressPreviewProps {
  fileName: string;
  totalCount: number;
  currentIndex: number;
  imageUrl: string | null;
  onPrev: () => void;
  onNext: () => void;
  onReupload: () => void;
  reuploadLabel: string;
  moreImagesTemplate: string;
  prevAria: string;
  nextAria: string;
  disabled?: boolean;
  showCompressed: boolean;
  onToggleCompressed: (checked: boolean) => void;
  compareLabel: string;
}

export function ImageCompressPreview({
  fileName,
  totalCount,
  currentIndex,
  imageUrl,
  onPrev,
  onNext,
  onReupload,
  reuploadLabel,
  moreImagesTemplate,
  prevAria,
  nextAria,
  disabled = false,
  showCompressed,
  onToggleCompressed,
  compareLabel,
}: ImageCompressPreviewProps) {
  const multi = totalCount > 1;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="truncate font-display text-[12px]"
            style={{ color: "var(--ink)" }}
          >
            {fileName}
          </span>
          {multi && (
            <span
              className="shrink-0 font-display text-[11px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {template(moreImagesTemplate, { n: totalCount - 1 })}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onReupload}
          disabled={disabled}
          className="shrink-0 rounded-[5px] border px-2.5 py-1 font-display text-[11px] transition-colors hover:border-[color:var(--accent-electric)] disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            color: "var(--ink-strong)",
          }}
        >
          {reuploadLabel}
        </button>
      </div>

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
      </div>

      <div className="relative flex min-h-[28px] items-center justify-center gap-3">
        {multi && (
          <>
            <button
              type="button"
              onClick={onPrev}
              disabled={currentIndex === 0}
              aria-label={prevAria}
              className="rounded-[5px] border p-1 transition-colors hover:border-[color:var(--accent-electric)] disabled:opacity-40"
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
              className="rounded-[5px] border p-1 transition-colors hover:border-[color:var(--accent-electric)] disabled:opacity-40"
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
          className="absolute right-0 inline-flex cursor-pointer select-none items-center gap-1.5 font-display text-[11px]"
          style={{ color: "var(--ink-soft)" }}
        >
          {compareLabel}
          <input
            type="checkbox"
            checked={showCompressed}
            onChange={(e) => onToggleCompressed(e.target.checked)}
            style={{ accentColor: "var(--accent-electric)" }}
          />
        </label>
      </div>
    </div>
  );
}
