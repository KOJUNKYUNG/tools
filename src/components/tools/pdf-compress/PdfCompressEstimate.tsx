"use client";

import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { type CompressionPreset } from "@/lib/pdf/compressPdf";
import type { PdfCompressLabels } from "./labels";

/** Reduction factor ranges [min, max] for each preset (fraction of original kept). */
const PRESET_RANGE: Record<CompressionPreset, [number, number]> = {
  low:    [0.7, 0.9], // Light: 10–30% reduction → 70–90% of original remains
  medium: [0.4, 0.7], // Medium: 30–60% reduction → 40–70% remains
  high:   [0.2, 0.4], // Heavy: 60–80% reduction → 20–40% remains
};

/**
 * What fraction of original image bytes is left after re-encoding at this preset.
 * Rough nominal values derived from JPEG quality + typical scan content.
 */
const PRESET_IMAGE_RATIO: Record<CompressionPreset, number> = {
  low:    1.0,   // images untouched
  medium: 0.5,
  high:   0.35,
};

function estimateCompressedSize(
  originalSize: number,
  imageShare: number, // 0..1
  preset: CompressionPreset,
): number {
  const presetRatio = PRESET_IMAGE_RATIO[preset];
  // image portion shrinks to presetRatio; non-image portion stays ~unchanged
  return originalSize * (1 - imageShare * (1 - presetRatio));
}

interface PdfCompressEstimateProps {
  preset: CompressionPreset;
  originalSize: number;
  labels: PdfCompressLabels;
  /**
   * Fraction of the PDF's original bytes that are images (0..1).
   * When set, replaces the static range estimate with a smarter derived size.
   * null = analysis pending or failed → fall back to static range.
   */
  imageShare?: number | null;
}

export function PdfCompressEstimate({
  preset,
  originalSize,
  labels,
  imageShare,
}: PdfCompressEstimateProps) {
  const descMap: Record<CompressionPreset, string> = {
    low:    labels.presetLightDesc,
    medium: labels.presetMediumDesc,
    high:   labels.presetHeavyDesc,
  };

  let rangeText: string;
  if (imageShare != null) {
    if (imageShare >= 0.05 && preset !== "low") {
      const derived = Math.round(estimateCompressedSize(originalSize, imageShare, preset));
      rangeText = template(labels.estimateActualTemplate, {
        size: formatBytes(derived),
      });
    } else {
      // Negligible image content or "low" preset — compression won't change much
      rangeText = labels.estimateNoChange;
    }
  } else {
    // Analysis pending or failed — fall back to static range
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
