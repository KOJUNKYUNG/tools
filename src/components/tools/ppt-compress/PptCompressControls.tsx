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
  "nameplate h-8 flex-1 rounded-[9px] px-3 font-display text-[12px] font-medium";
const GROUP_LABEL =
  "font-display text-[11px] font-medium uppercase tracking-[0.08em]";

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
      <div className="flex gap-1.5">
        {options.map((opt) => {
          const active = preset === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              data-active={active}
              disabled={disabled}
              className={TOGGLE}
              style={active ? undefined : { color: "var(--ink-strong)" }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
