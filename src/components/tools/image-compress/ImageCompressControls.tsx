"use client";

import { template } from "@/lib/common/template";
import { formatBytes } from "@/lib/common/formatBytes";
import { MIN_QUALITY, type OutputFormat } from "@/lib/image/compressImage";
import { savingsPctText, type Savings } from "@/lib/image/computeSavings";
import { Loader2Icon } from "lucide-react";

const FORMAT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: "image/jpeg", label: "JPG" },
  { value: "image/png", label: "PNG" },
  { value: "image/webp", label: "WebP" },
];

/** The current image's estimate; "not-smaller" when it would not shrink. */
export type ImageEstimate = { size: number; savings: Savings } | "not-smaller";

interface ImageCompressControlsProps {
  formatTitle: string;
  qualityTitle: string;
  outputFormat: OutputFormat | null;
  onSelectFormat: (format: OutputFormat) => void;
  quality: number;
  onQualityChange: (quality: number) => void;
  estimate: ImageEstimate | null;
  estimating: boolean;
  estimateTemplate: string;
  estimateNotSmallerLabel: string;
  estimatingLabel: string;
  underOnePctLabel: string;
  pngLosslessLabel: string;
}

export function ImageCompressControls({
  formatTitle,
  qualityTitle,
  outputFormat,
  onSelectFormat,
  quality,
  onQualityChange,
  estimate,
  estimating,
  estimateTemplate,
  estimateNotSmallerLabel,
  estimatingLabel,
  underOnePctLabel,
  pngLosslessLabel,
}: ImageCompressControlsProps) {
  return (
    <div className="space-y-3">
      <div>
        <p
          className="mb-1.5 font-mono text-[11px]"
          style={{ color: "var(--ink-soft)" }}
        >
          {formatTitle}
        </p>
        <div className="flex border-b" style={{ borderColor: "var(--hairline)" }}>
          {FORMAT_OPTIONS.map((opt) => {
            const active = outputFormat === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onSelectFormat(opt.value)}
                className="flex-1 border-b-2 py-2 font-body text-[12px] font-medium transition-colors"
                style={{
                  color: active ? "var(--ink-strong)" : "var(--ink-soft)",
                  borderBottomColor: active ? "var(--emphasis)" : "transparent",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p
            className="font-mono text-[11px]"
            style={{ color: "var(--ink-soft)" }}
          >
            {qualityTitle}
          </p>
          <span
            className="font-body text-[12px] font-semibold tabular-nums"
            style={{ color: "var(--ink-strong)" }}
          >
            {quality}%
          </span>
        </div>
        <input
          type="range"
          min={MIN_QUALITY}
          max={100}
          step={1}
          value={quality}
          onChange={(e) => onQualityChange(Number(e.target.value))}
          className="w-full"
          style={{ accentColor: "var(--ink-strong)" }}
        />
        <div
          className="mt-1 flex items-center gap-1.5 font-body text-[11px] leading-[1.4]"
          style={{ color: "var(--ink-soft)", minHeight: "16px" }}
        >
          {outputFormat === "image/png" ? (
            pngLosslessLabel
          ) : !outputFormat ? (
            " "
          ) : estimating ? (
            <>
              <Loader2Icon className="size-3 shrink-0 animate-spin" />
              {estimatingLabel}
            </>
          ) : estimate === "not-smaller" ? (
            estimateNotSmallerLabel
          ) : estimate ? (
            template(estimateTemplate, {
              size: formatBytes(estimate.size),
              pct: savingsPctText(estimate.savings, underOnePctLabel, { signed: true }),
            })
          ) : (
            " "
          )}
        </div>
      </div>
    </div>
  );
}
