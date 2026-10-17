"use client";

import { ResultCard } from "@/components/common/ResultCard";
import { template } from "@/lib/common/template";
import { STRONGER_PRESET, type CompressionPreset } from "@/lib/ppt/pptCompressPlan";
import { presetLabel, type PptCompressLabels } from "./labels";

/**
 * What to tell the user when `preset` could not shrink the deck: try the next
 * stronger preset, or, at the strongest, that even it does not shrink the deck.
 * When no image could be re-encoded, every preset gives the same result, so
 * none is suggested.
 */
export function notSmallerMessage(
  preset: CompressionPreset,
  anyImageReencoded: boolean,
  labels: PptCompressLabels,
): string {
  if (!anyImageReencoded) return labels.notSmallerNoImages;
  const next = STRONGER_PRESET[preset];
  return next
    ? template(labels.notSmallerTryStronger, {
        preset: presetLabel(preset, labels),
        next: presetLabel(next, labels),
      })
    : template(labels.notSmallerOptimized, { preset: presetLabel(preset, labels) });
}

interface PptCompressNotSmallerProps {
  preset: CompressionPreset;
  anyImageReencoded: boolean;
  labels: PptCompressLabels;
}

/** The "could not shrink" result: nothing to download, so no actions. */
export function PptCompressNotSmaller({
  preset,
  anyImageReencoded,
  labels,
}: PptCompressNotSmallerProps) {
  return (
    <ResultCard title={labels.notSmallerTitle}>
      <p className="font-body text-[12px] leading-[1.6]" style={{ color: "var(--ink)" }}>
        {notSmallerMessage(preset, anyImageReencoded, labels)}
      </p>
    </ResultCard>
  );
}
