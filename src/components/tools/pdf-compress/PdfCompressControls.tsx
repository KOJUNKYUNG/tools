"use client";

import type { CompressionPreset } from "@/lib/pdf/compressPdf";
import type { PdfCompressLabels } from "./labels";

interface PdfCompressControlsProps {
  preset: CompressionPreset;
  onChange: (preset: CompressionPreset) => void;
  labels: PdfCompressLabels;
  disabled?: boolean;
}

const GROUP_LABEL =
  "font-display text-[11px] font-medium uppercase tracking-[0.08em]";

export function PdfCompressControls({
  preset,
  onChange,
  labels,
  disabled = false,
}: PdfCompressControlsProps) {
  const options: { value: CompressionPreset; label: string; desc: string }[] = [
    {
      value: "low",
      label: labels.presetLightLabel,
      desc: labels.presetLightDesc,
    },
    {
      value: "medium",
      label: labels.presetMediumLabel,
      desc: labels.presetMediumDesc,
    },
    {
      value: "high",
      label: labels.presetHeavyLabel,
      desc: labels.presetHeavyDesc,
    },
  ];

  return (
    <div className="space-y-2">
      <p className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
        {labels.presetGroupLabel}
      </p>
      <div className="flex flex-col gap-1.5">
        {options.map((opt) => {
          const active = preset === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              data-active={active}
              disabled={disabled}
              className="nameplate flex w-full items-center justify-between gap-3 rounded-[9px] px-3 py-2 text-left font-display text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
              style={active ? undefined : { color: "var(--ink-strong)" }}
            >
              <span>{opt.label}</span>
              <span
                className="font-body text-[11px] font-normal"
                style={{
                  color: active
                    ? "color-mix(in oklch, currentColor 80%, transparent)"
                    : "var(--ink-soft)",
                }}
              >
                {opt.desc}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
