"use client";

import type { CompressionPreset } from "@/lib/ppt/pptCompressPlan";
import type { PptCompressLabels } from "./labels";

interface PptCompressControlsProps {
  preset: CompressionPreset;
  onChange: (preset: CompressionPreset) => void;
  labels: PptCompressLabels;
  disabled?: boolean;
}

const TOGGLE =
  "flex-1 border-b-2 py-2 font-body text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const GROUP_LABEL =
  "font-mono text-[11px] font-medium uppercase tracking-[0.08em]";

export function PptCompressControls({
  preset,
  onChange,
  labels,
  disabled = false,
}: PptCompressControlsProps) {
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
                borderBottomColor: active ? "var(--emphasis)" : "transparent",
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
