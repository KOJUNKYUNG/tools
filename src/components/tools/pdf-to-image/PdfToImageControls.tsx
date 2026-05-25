"use client";

import type { DpiOption, OutputFormat } from "@/lib/pdf/pdfToImage";
import type { PdfToImageLabels } from "./labels";

interface PdfToImageControlsProps {
  format: OutputFormat;
  dpi: DpiOption;
  onFormatChange: (format: OutputFormat) => void;
  onDpiChange: (dpi: DpiOption) => void;
  labels: PdfToImageLabels;
}

const TOGGLE =
  "nameplate h-8 flex-1 rounded-[9px] px-3 font-display text-[12px] font-medium";
const GROUP_LABEL =
  "font-display text-[11px] font-medium uppercase tracking-[0.08em]";

export function PdfToImageControls({
  format,
  dpi,
  onFormatChange,
  onDpiChange,
  labels,
}: PdfToImageControlsProps) {
  const formats: { value: OutputFormat; label: string }[] = [
    { value: "image/jpeg", label: labels.formatJpg },
    { value: "image/png", label: labels.formatPng },
  ];
  const dpis: { value: DpiOption; label: string }[] = [
    { value: 72, label: labels.dpi72 },
    { value: 150, label: labels.dpi150 },
    { value: 300, label: labels.dpi300 },
  ];

  return (
    <div className="flex flex-wrap gap-4">
      <div className="min-w-[160px] flex-1 space-y-2">
        <p className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
          {labels.formatLabel}
        </p>
        <div className="flex gap-1.5">
          {formats.map((opt) => {
            const active = format === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onFormatChange(opt.value)}
                data-active={active}
                className={TOGGLE}
                style={active ? undefined : { color: "var(--ink-strong)" }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-[220px] flex-[2] space-y-2">
        <p className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
          {labels.dpiLabel}
        </p>
        <div className="flex gap-1.5">
          {dpis.map((opt) => {
            const active = dpi === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onDpiChange(opt.value)}
                data-active={active}
                className={TOGGLE}
                style={active ? undefined : { color: "var(--ink-strong)" }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {dpi === 300 && (
          <p className="font-body text-[11px]" style={{ color: "var(--accent-copper)" }}>
            {labels.dpiHint}
          </p>
        )}
      </div>
    </div>
  );
}
