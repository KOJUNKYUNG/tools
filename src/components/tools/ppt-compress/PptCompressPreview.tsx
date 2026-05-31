"use client";

import { useMemo } from "react";
import { Minimize2Icon } from "lucide-react";
import { template } from "@/lib/common/template";
import { formatBreakdownString } from "@/lib/ppt/pptImageFormats";
import type { PptCompressLabels } from "./labels";

interface PptCompressPreviewProps {
  thumbnailUrl: string | null;
  analyzing: boolean;
  imageCount: number | null;
  formatCounts: Record<string, number> | null;
  labels: PptCompressLabels;
}

export function PptCompressPreview({
  thumbnailUrl,
  analyzing,
  imageCount,
  formatCounts,
  labels,
}: PptCompressPreviewProps) {
  const breakdown = useMemo(() => {
    if (!formatCounts || !imageCount) return "";
    const upper: Record<string, number> = {};
    for (const [ext, n] of Object.entries(formatCounts)) {
      upper[ext.toUpperCase()] = n;
    }
    return formatBreakdownString(upper);
  }, [formatCounts, imageCount]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[8px] border"
        style={{ background: "var(--silver-100)", borderColor: "var(--silver-200)" }}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            draggable={false}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-4 text-center">
            {analyzing ? (
              <span
                className="font-body text-[11.5px]"
                style={{ color: "var(--silver-600)" }}
              >
                {labels.analyzingHint}
              </span>
            ) : (
              <>
                <Minimize2Icon
                  className="size-8"
                  style={{ color: "var(--silver-500)" }}
                />
                <span
                  className="font-body text-[11px]"
                  style={{ color: "var(--silver-600)" }}
                >
                  {labels.previewUnavailable}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {imageCount != null && (
        <div
          className="flex items-baseline justify-between gap-2 px-1 font-body text-[11.5px]"
          style={{ color: "var(--ink-soft)" }}
        >
          <span style={{ color: "var(--ink-strong)" }}>
            {labels.imagesLabel}:{" "}
            <strong
              style={{
                color: imageCount === 0 ? "var(--ink-soft)" : "var(--ink-strong)",
              }}
            >
              {template(labels.imageCountTemplate, { n: imageCount })}
            </strong>
          </span>
          <span className="truncate" title={breakdown || labels.noImagesHint}>
            {breakdown || labels.noImagesHint}
          </span>
        </div>
      )}
    </div>
  );
}
