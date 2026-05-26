"use client";

import { DownloadIcon, RotateCcwIcon } from "lucide-react";
import { formatBytes } from "@/lib/common/formatBytes";
import { computeSavings } from "@/lib/image/computeSavings";
import type { PdfCompressLabels } from "./labels";

interface PdfCompressResultProps {
  originalSize: number;
  compressedSize: number;
  onDownload: () => void;
  onAgain: () => void;
  labels: PdfCompressLabels;
}

export function PdfCompressResult({
  originalSize,
  compressedSize,
  onDownload,
  onAgain,
  labels,
}: PdfCompressResultProps) {
  const { pct } = computeSavings(originalSize, compressedSize);

  return (
    <div
      className="flex h-full flex-col gap-3 rounded-[8px] border p-4"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "inset 2px 0 0 var(--accent-electric)",
      }}
    >
      <div
        className="font-display text-[13px] font-semibold"
        style={{ color: "var(--headline)" }}
      >
        {labels.resultTitle}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p
            className="font-body text-[11px]"
            style={{ color: "var(--ink-soft)" }}
          >
            {labels.originalSizeLabel}
          </p>
          <p
            className="font-display text-[14px] font-semibold tabular-nums"
            style={{ color: "var(--ink-strong)" }}
          >
            {formatBytes(originalSize)}
          </p>
        </div>
        <div>
          <p
            className="font-body text-[11px]"
            style={{ color: "var(--ink-soft)" }}
          >
            {labels.compressedSizeLabel}
          </p>
          <p
            className="font-display text-[14px] font-semibold tabular-nums"
            style={{ color: "var(--ink-strong)" }}
          >
            {formatBytes(compressedSize)}
          </p>
        </div>
        <div>
          <p
            className="font-body text-[11px]"
            style={{ color: "var(--ink-soft)" }}
          >
            {labels.savingsLabel}
          </p>
          <p
            className="font-display text-[14px] font-semibold tabular-nums"
            style={{ color: "var(--accent-electric)" }}
          >
            {pct}%
          </p>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onDownload}
          className="btn-download glint inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[9px] px-4 font-display text-[12px] font-medium"
        >
          <DownloadIcon className="size-3.5" />
          {labels.download}
        </button>
        <button
          type="button"
          onClick={onAgain}
          className="nameplate inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-3 font-display text-[12px]"
          style={{ color: "var(--ink-strong)" }}
        >
          <RotateCcwIcon className="size-3.5" />
          {labels.again}
        </button>
      </div>
    </div>
  );
}
