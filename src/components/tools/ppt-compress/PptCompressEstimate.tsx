"use client";

import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import {
  estimatePptxSize,
  PRESET_RANGE,
  PRESET_IMAGE_SHARE_CUTOFF,
  type CompressionPreset,
} from "@/lib/ppt/pptCompressPlan";
import type { PptCompressLabels } from "./labels";

interface PptCompressEstimateProps {
  preset: CompressionPreset;
  originalSize: number;
  labels: PptCompressLabels;
  /** Recompressible (jpg/jpeg/png) media bytes. null = analysis pending/failed. */
  recompressibleBytes?: number | null;
}

export function PptCompressEstimate({
  preset,
  originalSize,
  labels,
  recompressibleBytes,
}: PptCompressEstimateProps) {
  const descMap: Record<CompressionPreset, string> = {
    low: labels.presetLightDesc,
    medium: labels.presetMediumDesc,
    high: labels.presetHeavyDesc,
  };

  let rangeText: string;
  if (recompressibleBytes != null && originalSize > 0) {
    const share = recompressibleBytes / originalSize;
    if (share >= PRESET_IMAGE_SHARE_CUTOFF[preset]) {
      const derived = Math.round(
        estimatePptxSize(originalSize, recompressibleBytes, preset),
      );
      rangeText = template(labels.estimateActualTemplate, {
        size: formatBytes(derived),
      });
    } else {
      rangeText = labels.estimateNoChange;
    }
  } else {
    const [lo, hi] = PRESET_RANGE[preset];
    const fromStr = formatBytes(Math.round(originalSize * lo));
    const toStr = formatBytes(Math.round(originalSize * hi));
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
