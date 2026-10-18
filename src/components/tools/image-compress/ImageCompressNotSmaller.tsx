"use client";

import { ResultCard } from "@/components/common/ResultCard";
import { template } from "@/lib/common/template";
import { MIN_QUALITY, type OutputFormat } from "@/lib/image/compressImage";
import type { ImageCompressLabels } from "./labels";

/**
 * What to tell the user when no image could shrink: lower the quality, or, at
 * the lowest, that even it does not shrink them. PNG has no quality setting.
 */
export function notSmallerMessage(
  format: OutputFormat,
  quality: number,
  labels: ImageCompressLabels,
): string {
  if (format === "image/png") return labels.notSmallerPng;
  return template(
    quality > MIN_QUALITY ? labels.notSmallerLowerQuality : labels.notSmallerLowestQuality,
    { quality },
  );
}

interface ImageCompressNotSmallerProps {
  format: OutputFormat;
  quality: number;
  labels: ImageCompressLabels;
}

/** The "could not shrink" result: nothing to download, so no actions. */
export function ImageCompressNotSmaller({ format, quality, labels }: ImageCompressNotSmallerProps) {
  return (
    <ResultCard title={labels.notSmallerTitle}>
      <p className="font-body text-[12px] leading-[1.6]" style={{ color: "var(--ink)" }}>
        {notSmallerMessage(format, quality, labels)}
      </p>
    </ResultCard>
  );
}
