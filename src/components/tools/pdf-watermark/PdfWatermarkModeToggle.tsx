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
    <div className="flex border-b" style={{ borderColor: "var(--hairline)" }}>
      {ORDER.map((mode) => {
        const active = value === mode;
        const label = mode === "number" ? labels.modeNumber : labels.modeWatermark;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            disabled={disabled}
            className="flex-1 border-b-2 py-2 font-body text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              color: active ? "var(--ink-strong)" : "var(--ink-soft)",
              borderBottomColor: active ? "var(--emphasis)" : "transparent",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
