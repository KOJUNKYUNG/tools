"use client";

import { template } from "@/lib/common/template";
import { formatBytes } from "@/lib/common/formatBytes";
import type { OutputFormat } from "@/lib/image/compressImage";
import { Loader2Icon } from "lucide-react";

const FORMAT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: "image/jpeg", label: "JPG" },
  { value: "image/png", label: "PNG" },
  { value: "image/webp", label: "WebP" },
];

function pctText(pct: number): string {
  if (pct > 0) return `-${pct}%`;
  if (pct < 0) return `+${-pct}%`;
  return "±0%";
}

interface ImageCompressControlsProps {
  formatTitle: string;
  qualityTitle: string;
  outputFormat: OutputFormat | null;
  onSelectFormat: (format: OutputFormat) => void;
  quality: number;
  onQualityChange: (quality: number) => void;
  estimate: { size: number; pct: number } | null;
  estimating: boolean;
  estimateTemplate: string;
  estimatingLabel: string;
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
  estimatingLabel,
  pngLosslessLabel,
}: ImageCompressControlsProps) {
  return (
    <div className="space-y-3">
      <div>
        <p
          className="mb-1.5 font-display text-[11px]"
          style={{ color: "var(--ink-soft)" }}
        >
          {formatTitle}
        </p>
        <div className="flex gap-1.5">
          {FORMAT_OPTIONS.map((opt) => {
            const active = outputFormat === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onSelectFormat(opt.value)}
                data-active={active}
                className="nameplate h-8 flex-1 rounded-[9px] px-3 font-display text-[12px] font-medium"
                style={active ? undefined : { color: "var(--ink-strong)" }}
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
            className="font-display text-[11px]"
            style={{ color: "var(--ink-soft)" }}
          >
            {qualityTitle}
          </p>
          <span
            className="font-display text-[12px] font-semibold"
            style={{ color: "var(--accent-electric)" }}
          >
            {quality}%
          </span>
        </div>
        <input
          type="range"
          min={10}
          max={100}
          step={1}
          value={quality}
          onChange={(e) => onQualityChange(Number(e.target.value))}
          className="w-full"
          style={{ accentColor: "var(--accent-electric)" }}
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
          ) : estimate ? (
            template(estimateTemplate, {
              size: formatBytes(estimate.size),
              pct: pctText(estimate.pct),
            })
          ) : (
            " "
          )}
        </div>
      </div>
    </div>
  );
}
