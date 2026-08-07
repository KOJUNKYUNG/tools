"use client";

import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { type CompressionPreset } from "@/lib/pdf/compressPdf";
import { selectSizeEstimate } from "@/lib/pdf/compressEstimate";
import type { PdfCompressLabels } from "./labels";

interface PdfCompressEstimateProps {
  preset: CompressionPreset;
  originalSize: number;
  labels: PdfCompressLabels;
  /** Fraction of bytes that are images (0..1); null = pending/failed. */
  imageShare?: number | null;
  /** Real compressed size from a completed whole-doc live compress; null if none. */
  actualCompressedSize?: number | null;
}

export function PdfCompressEstimate({
  preset,
  originalSize,
  labels,
  imageShare,
  actualCompressedSize,
}: PdfCompressEstimateProps) {
  const descMap: Record<CompressionPreset, string> = {
    low: labels.presetLightDesc,
    medium: labels.presetMediumDesc,
    high: labels.presetHeavyDesc,
  };

  const estimate = selectSizeEstimate({
    originalSize,
    actualCompressedSize: actualCompressedSize ?? null,
    imageShare: imageShare ?? null,
    preset,
  });

  let rangeText: string;
  switch (estimate.kind) {
    case "actual":
      rangeText = template(labels.estimateActualTemplate, { size: formatBytes(estimate.size) });
      break;
    case "model":
      rangeText = template(labels.estimateActualTemplate, { size: formatBytes(estimate.size) });
      break;
    case "noChange":
      rangeText = labels.estimateNoChange;
      break;
    case "range": {
      const fromStr = formatBytes(estimate.from);
      const toStr = formatBytes(estimate.to);
      rangeText = fromStr === toStr ? fromStr : template(labels.estimateTemplate, { from: fromStr, to: toStr });
      break;
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 font-body text-[12px]" style={{ color: "var(--ink-soft)" }}>
      <span className="truncate">{descMap[preset]}</span>
      <span className="shrink-0 tabular-nums" style={{ color: "var(--ink)" }}>
        {rangeText}
      </span>
    </div>
  );
}
