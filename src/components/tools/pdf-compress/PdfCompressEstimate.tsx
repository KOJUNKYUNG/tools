"use client";

import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import type { CompressionPreset } from "@/lib/pdf/compressPdf";
import type { PdfCompressLabels } from "./labels";

/** Reduction factor ranges [min, max] for each preset (fraction of original kept). */
const PRESET_RANGE: Record<CompressionPreset, [number, number]> = {
  low: [0.7, 0.9],    // Light: 10–30% reduction → 70–90% of original remains
  medium: [0.4, 0.7], // Medium: 30–60% reduction → 40–70% remains
  high: [0.2, 0.4],   // Heavy: 60–80% reduction → 20–40% remains
};

interface PdfCompressEstimateProps {
  preset: CompressionPreset;
  originalSize: number;
  labels: PdfCompressLabels;
  /** When set, replaces the static range estimate with a real derived size. */
  liveRatio?: number | null;
}

export function PdfCompressEstimate({
  preset,
  originalSize,
  labels,
  liveRatio,
}: PdfCompressEstimateProps) {
  const descMap: Record<CompressionPreset, string> = {
    low: labels.presetLightDesc,
    medium: labels.presetMediumDesc,
    high: labels.presetHeavyDesc,
  };

  let rangeText: string;
  if (liveRatio != null) {
    const derived = Math.round(originalSize * liveRatio);
    rangeText = template(labels.estimateActualTemplate, {
      size: formatBytes(derived),
    });
  } else {
    const [lo, hi] = PRESET_RANGE[preset];
    const fromBytes = Math.round(originalSize * lo);
    const toBytes = Math.round(originalSize * hi);
    const fromStr = formatBytes(fromBytes);
    const toStr = formatBytes(toBytes);
    // If both endpoints round to the same display string, show a single value.
    rangeText =
      fromStr === toStr
        ? fromStr
        : template(labels.estimateTemplate, { from: fromStr, to: toStr });
  }

  return (
    <div
      className="flex items-center justify-between gap-3 font-body text-[12px]"
      style={{ color: "var(--ink-soft)" }}
    >
      <span className="truncate">{descMap[preset]}</span>
      <span className="shrink-0 tabular-nums" style={{ color: "var(--ink)" }}>
        {rangeText}
      </span>
    </div>
  );
}
