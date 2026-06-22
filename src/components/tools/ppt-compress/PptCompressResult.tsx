"use client";

import { DownloadIcon, RotateCcwIcon } from "lucide-react";
import { formatBytes } from "@/lib/common/formatBytes";
import { computeSavings } from "@/lib/image/computeSavings";
import type { PptCompressLabels } from "./labels";

interface PptCompressResultProps {
  originalSize: number;
  compressedSize: number;
  onDownload: () => void;
  onAgain: () => void;
  labels: PptCompressLabels;
}

export function PptCompressResult({
  originalSize,
  compressedSize,
  onDownload,
  onAgain,
  labels,
}: PptCompressResultProps) {
  const { pct } = computeSavings(originalSize, compressedSize);

  return (
    <div
      className="result-pop flex flex-col gap-3 rounded-[8px] border p-4"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "inset 2px 0 0 var(--emphasis)",
      }}
    >
      <div
        className="font-ko text-[13px] font-medium"
        style={{ color: "var(--headline)" }}
      >
        {labels.resultTitle}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
            {labels.originalSizeLabel}
          </p>
          <p
            className="font-body text-[14px] font-semibold tabular-nums"
            style={{ color: "var(--ink-strong)" }}
          >
            {formatBytes(originalSize)}
          </p>
        </div>
        <div>
          <p className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
            {labels.compressedSizeLabel}
          </p>
          <p
            className="font-body text-[14px] font-semibold tabular-nums"
            style={{ color: "var(--ink-strong)" }}
          >
            {formatBytes(compressedSize)}
          </p>
        </div>
        <div>
          <p className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
            {labels.savingsLabel}
          </p>
          <p
            className="font-body text-[14px] font-semibold tabular-nums"
            style={{ color: "var(--ink-strong)" }}
          >
            {pct}%
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onDownload}
          className="btn-download inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[9px] px-4 font-body text-[12px] font-medium"
        >
          <DownloadIcon className="size-3.5" />
          {labels.download}
        </button>
        <button
          type="button"
          onClick={onAgain}
          className="nameplate inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-3 font-body text-[12px]"
          style={{ color: "var(--ink-strong)" }}
        >
          <RotateCcwIcon className="size-3.5" />
          {labels.again}
        </button>
      </div>
    </div>
  );
}
