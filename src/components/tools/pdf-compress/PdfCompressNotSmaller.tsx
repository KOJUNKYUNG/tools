"use client";

import { ResultCard } from "@/components/common/ResultCard";
import { template } from "@/lib/common/template";
import { STRONGER_PRESET, type CompressionPreset } from "@/lib/pdf/compressPdf";
import { presetLabel, type PdfCompressLabels } from "./labels";

/**
 * What to tell the user when `preset` could not shrink the file: try the next
 * stronger preset, or, at the strongest, that the file is already optimised.
 */
export function notSmallerMessage(preset: CompressionPreset, labels: PdfCompressLabels): string {
  const next = STRONGER_PRESET[preset];
  return next
    ? template(labels.notSmallerTryStronger, {
        preset: presetLabel(preset, labels),
        next: presetLabel(next, labels),
      })
    : template(labels.notSmallerOptimized, { preset: presetLabel(preset, labels) });
}

interface PdfCompressNotSmallerProps {
  preset: CompressionPreset;
  labels: PdfCompressLabels;
}

/** The "could not shrink" result: nothing to download, so no actions. */
export function PdfCompressNotSmaller({ preset, labels }: PdfCompressNotSmallerProps) {
  return (
    <ResultCard title={labels.notSmallerTitle}>
      <p className="font-body text-[12px] leading-[1.6]" style={{ color: "var(--ink)" }}>
        {notSmallerMessage(preset, labels)}
      </p>
    </ResultCard>
  );
}
