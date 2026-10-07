"use client";

import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { type CompressionPreset } from "@/lib/pdf/compressPdf";
import type { SizeDisplay } from "@/lib/pdf/compressEstimate";
import type { PdfCompressLabels } from "./labels";

interface PdfCompressEstimateProps {
  preset: CompressionPreset;
  display: SizeDisplay;
  labels: PdfCompressLabels;
  /** One-line notes under the row (deferred-preview hint, safe-mode notice). */
  notes?: string[];
}

export function PdfCompressEstimate({ preset, display, labels, notes = [] }: PdfCompressEstimateProps) {
  const descMap: Record<CompressionPreset, string> = {
    low: labels.presetLightDesc,
    medium: labels.presetMediumDesc,
    high: labels.presetHeavyDesc,
  };

  const value =
    display.kind === "actual"
      ? template(labels.estimateActualTemplate, { size: formatBytes(display.size) })
      : display.kind === "computing"
        ? labels.estimateComputing
        : labels.estimateAfterCompress;

  return (
    <div className="space-y-1.5 font-body text-[12px]">
      <div className="flex items-center justify-between gap-3" style={{ color: "var(--ink-soft)" }}>
        <span className="truncate">{descMap[preset]}</span>
        <span className="shrink-0 tabular-nums" style={{ color: "var(--ink)" }}>
          {value}
        </span>
      </div>
      {notes.map((note) => (
        <p key={note} className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
          {note}
        </p>
      ))}
    </div>
  );
}
