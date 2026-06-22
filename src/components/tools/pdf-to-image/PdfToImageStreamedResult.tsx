"use client";

import { RotateCcwIcon } from "lucide-react";
import { template } from "@/lib/common/template";
import type { PdfToImageLabels } from "./labels";

interface PdfToImageStreamedResultProps {
  imageCount: number;
  batchCount: number;
  labels: PdfToImageLabels;
  onAgain: () => void;
}

export function PdfToImageStreamedResult({
  imageCount,
  batchCount,
  labels,
  onAgain,
}: PdfToImageStreamedResultProps) {
  return (
    <div
      className="result-pop flex flex-col items-center justify-center gap-4 rounded-[8px] border"
      style={{
        height: "52vh",
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      <div
        className="font-ko text-[15px] font-medium"
        style={{ color: "var(--headline)" }}
      >
        {labels.streamedTitle}
      </div>
      <div className="font-body text-[12.5px]" style={{ color: "var(--ink-soft)" }}>
        {template(labels.streamedSummary, { n: imageCount, m: batchCount })}
      </div>
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
  );
}
