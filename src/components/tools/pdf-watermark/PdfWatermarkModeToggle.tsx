"use client";

import type { WatermarkMode } from "@/lib/pdf/watermarkNaming";
import type { PdfWatermarkLabels } from "./labels";

interface PdfWatermarkModeToggleProps {
  value: WatermarkMode;
  onChange: (next: WatermarkMode) => void;
  labels: PdfWatermarkLabels;
  disabled?: boolean;
}

const ORDER: WatermarkMode[] = ["number", "watermark"];

export function PdfWatermarkModeToggle({
  value,
  onChange,
  labels,
  disabled = false,
}: PdfWatermarkModeToggleProps) {
  return (
    <div
      className="flex overflow-hidden rounded-[6px] border"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
    >
      {ORDER.map((mode) => {
        const active = value === mode;
        const label = mode === "number" ? labels.modeNumber : labels.modeWatermark;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            disabled={disabled}
            className="flex-1 py-2 font-display text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: active ? "var(--surface)" : "transparent",
              color: active ? "var(--ink-strong)" : "var(--ink-soft)",
              boxShadow: active ? "inset 0 -2px 0 var(--accent-electric)" : undefined,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
