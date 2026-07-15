"use client";

import { template } from "@/lib/common/template";
import { formatBytes } from "@/lib/common/formatBytes";
import { ResultCard } from "@/components/common/ResultCard";
import { ResultActions } from "@/components/common/ResultActions";
import type { PdfWatermarkLabels } from "./labels";

interface PdfWatermarkResultProps {
  appliedPages: number;
  pageCount: number;
  outputSize: number;
  onDownload: () => void;
  labels: PdfWatermarkLabels;
}

export function PdfWatermarkResult({
  appliedPages,
  pageCount,
  outputSize,
  onDownload,
  labels,
}: PdfWatermarkResultProps) {
  return (
    <ResultCard
      title={labels.resultTitle}
      actions={
        <ResultActions
          download={{ label: labels.download, onClick: onDownload }}
        />
      }
    >
      <p className="font-body text-[12px]" style={{ color: "var(--ink)" }}>
        {template(labels.resultPagesTemplate, {
          applied: appliedPages,
          total: pageCount,
        })}
      </p>
      <p className="font-body text-[12px] tabular-nums" style={{ color: "var(--ink-soft)" }}>
        {template(labels.resultSizeTemplate, { size: formatBytes(outputSize) })}
      </p>
    </ResultCard>
  );
}
