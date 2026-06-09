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
  "flex-1 py-2 font-body text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const GROUP_LABEL =
  "font-mono text-[11px] font-medium uppercase tracking-[0.08em]";

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
    <div className="flex flex-wrap items-start gap-4">
      <div className="min-w-[160px] flex-1 space-y-2">
        <p className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
          {labels.formatLabel}
        </p>
        <div className="flex border-b" style={{ borderColor: "var(--hairline)" }}>
          {formats.map((opt) => {
            const active = format === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onFormatChange(opt.value)}
                className={TOGGLE}
                style={{
                  color: active ? "var(--ink-strong)" : "var(--ink-soft)",
                  boxShadow: active ? "inset 0 -2px 0 var(--emphasis)" : undefined,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-[220px] flex-[2] space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p
            className={`${GROUP_LABEL} cursor-help underline decoration-dotted underline-offset-2`}
            style={{ color: "var(--ink-soft)" }}
            title={labels.dpiAbout}
          >
            {labels.dpiLabel}
          </p>
          {dpi === 300 && (
            <span
              className="font-body text-[10.5px] leading-tight"
              style={{ color: "var(--ink-soft)" }}
            >
              {labels.dpiHint}
            </span>
          )}
        </div>
        <div className="flex border-b" style={{ borderColor: "var(--hairline)" }}>
          {dpis.map((opt) => {
            const active = dpi === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onDpiChange(opt.value)}
                className={TOGGLE}
                style={{
                  color: active ? "var(--ink-strong)" : "var(--ink-soft)",
                  boxShadow: active ? "inset 0 -2px 0 var(--emphasis)" : undefined,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
