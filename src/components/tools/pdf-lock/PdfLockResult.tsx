"use client";

import { DownloadIcon, RotateCcwIcon, LockIcon, UnlockIcon } from "lucide-react";
import { template } from "@/lib/common/template";
import { formatBytes } from "@/lib/common/formatBytes";
import type { LockMode } from "@/lib/pdf/pdfLockNaming";
import type { PdfLockLabels } from "./labels";

interface PdfLockResultProps {
  mode: LockMode;
  outputSize: number;
  onDownload: () => void;
  onAgain: () => void;
  labels: PdfLockLabels;
}

export function PdfLockResult({
  mode,
  outputSize,
  onDownload,
  onAgain,
  labels,
}: PdfLockResultProps) {
  const title = mode === "lock" ? labels.resultLockTitle : labels.resultUnlockTitle;
  const Icon = mode === "lock" ? LockIcon : UnlockIcon;
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
        className="flex items-center gap-1.5 font-ko text-[13px] font-medium"
        style={{ color: "var(--headline)" }}
      >
        <Icon className="size-4" style={{ color: "var(--headline)" }} />
        {title}
      </div>
      <p className="font-body text-[12px] tabular-nums" style={{ color: "var(--ink-soft)" }}>
        {template(labels.resultSizeTemplate, { size: formatBytes(outputSize) })}
      </p>
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
