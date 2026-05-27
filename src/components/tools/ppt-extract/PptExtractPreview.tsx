"use client";

import { useEffect, useMemo, useState } from "react";
import { ImageDownIcon } from "lucide-react";
import { template } from "@/lib/common/template";
import {
  analyzePresentation,
  type PresentationAnalysis,
} from "@/lib/ppt/analyzePresentation";
import type { PptExtractLabels } from "./labels";

interface PptExtractPreviewProps {
  file: File;
  labels: PptExtractLabels;
}

export function PptExtractPreview({ file, labels }: PptExtractPreviewProps) {
  const [analysis, setAnalysis] = useState<PresentationAnalysis | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Analyze whenever the file changes. Failure is non-fatal — we just show
  // the placeholder + extract button still works.
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setAnalyzing(true);
    setAnalysis(null);
    setThumbnailUrl(null);
    (async () => {
      try {
        const result = await analyzePresentation(file);
        if (cancelled) return;
        setAnalysis(result);
        if (result.thumbnailBlob) {
          createdUrl = URL.createObjectURL(result.thumbnailBlob);
          setThumbnailUrl(createdUrl);
        }
      } catch {
        if (!cancelled) {
          // Analysis failed — leave analysis null, preview will show placeholder.
        }
      } finally {
        if (!cancelled) setAnalyzing(false);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [file]);

  const breakdown = useMemo(() => {
    if (!analysis || analysis.imageCount === 0) return "";
    return Object.entries(analysis.formatCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([ext, n]) => `${ext.toUpperCase()} ${n}`)
      .join(" · ");
  }, [analysis]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[8px] border"
        style={{
          background: "var(--silver-100)",
          borderColor: "var(--silver-200)",
        }}
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
                <ImageDownIcon
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

      {/* Sub-row under thumbnail: count + breakdown when available */}
      {analysis && analysis.imageCount > 0 && (
        <div
          className="flex items-baseline justify-between gap-2 px-1 font-body text-[11.5px]"
          style={{ color: "var(--ink-soft)" }}
        >
          <span style={{ color: "var(--ink-strong)" }}>
            {labels.imagesLabel}:{" "}
            <strong style={{ color: "var(--ink-strong)" }}>
              {template(labels.imageCountTemplate, { n: analysis.imageCount })}
            </strong>
          </span>
          <span className="truncate" title={breakdown}>
            {breakdown}
          </span>
        </div>
      )}
    </div>
  );
}
