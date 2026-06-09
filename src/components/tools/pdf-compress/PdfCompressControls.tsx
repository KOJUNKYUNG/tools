"use client";

import type { CompressionPreset } from "@/lib/pdf/compressPdf";
import type { PdfCompressLabels } from "./labels";

interface PdfCompressControlsProps {
  preset: CompressionPreset;
  onChange: (preset: CompressionPreset) => void;
  labels: PdfCompressLabels;
  disabled?: boolean;
}

const TOGGLE =
  "flex-1 py-2 font-body text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const GROUP_LABEL =
  "font-mono text-[11px] font-medium uppercase tracking-[0.08em]";

export function PdfCompressControls({
  preset,
  onChange,
  labels,
  disabled = false,
}: PdfCompressControlsProps) {
  const options: { value: CompressionPreset; label: string }[] = [
    { value: "low", label: labels.presetLightLabel },
    { value: "medium", label: labels.presetMediumLabel },
    { value: "high", label: labels.presetHeavyLabel },
  ];

  return (
    <div className="space-y-2">
      <p className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
        {labels.presetGroupLabel}
      </p>
      <div className="flex border-b" style={{ borderColor: "var(--hairline)" }}>
        {options.map((opt) => {
          const active = preset === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              disabled={disabled}
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
  );
}
