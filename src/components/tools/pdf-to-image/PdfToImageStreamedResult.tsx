"use client";

import { template } from "@/lib/common/template";
import { ResultActions } from "@/components/common/ResultActions";
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
        minHeight: "var(--tray-h)",
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
      <ResultActions again={{ label: labels.again, onClick: onAgain }} />
    </div>
  );
}
