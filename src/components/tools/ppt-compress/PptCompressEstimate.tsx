"use client";

import type { CompressionPreset } from "@/lib/common/compressionPreset";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import {
  estimatePptxSize,
  PRESET_RANGE,
  type MediaSample,
} from "@/lib/ppt/pptCompressPlan";
import type { PptCompressLabels } from "./labels";

interface PptCompressEstimateProps {
  preset: CompressionPreset;
  originalSize: number;
  labels: PptCompressLabels;
  /** The deck's recompressible images. null = analysis pending/failed. */
  media?: readonly MediaSample[] | null;
}

export function PptCompressEstimate({
  preset,
  originalSize,
  labels,
  media,
}: PptCompressEstimateProps) {
  const descMap: Record<CompressionPreset, string> = {
    low: labels.presetLightDesc,
    medium: labels.presetMediumDesc,
    high: labels.presetHeavyDesc,
  };

  let rangeText: string;
  if (media != null && originalSize > 0) {
    const derived = estimatePptxSize(originalSize, media, preset);
    rangeText =
      derived === null
        ? labels.estimateNoChange
        : template(labels.estimateActualTemplate, { size: formatBytes(Math.round(derived)) });
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
