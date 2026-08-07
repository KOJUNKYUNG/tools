"use client";

import { NumberField } from "@/components/common/NumberField";

export type PageSizeMode = "fit" | "a4" | "custom";

export interface CustomSize {
  /** Page width in px (mapped 1px → 1pt at assemble time). */
  w: number;
  /** Page height in px. */
  h: number;
}

interface PageSizeSelectorProps {
  mode: PageSizeMode;
  onModeChange: (mode: PageSizeMode) => void;
  custom: CustomSize;
  onCustomChange: (next: CustomSize) => void;
  labels: {
    sizeLabel: string;
    sizeFit: string;
    sizeA4: string;
    sizeCustom: string;
    customWidth: string;
    customHeight: string;
  };
}

const OPTIONS: { value: PageSizeMode; key: "sizeFit" | "sizeA4" | "sizeCustom" }[] = [
  { value: "fit", key: "sizeFit" },
  { value: "a4", key: "sizeA4" },
  { value: "custom", key: "sizeCustom" },
];

export function PageSizeSelector({
  mode,
  onModeChange,
  custom,
  onCustomChange,
  labels,
}: PageSizeSelectorProps) {
  return (
    <div className="space-y-2">
      <p
        className="font-mono text-[11px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--ink-soft)" }}
      >
        {labels.sizeLabel}
      </p>
      <div className="flex border-b" style={{ borderColor: "var(--hairline)" }}>
        {OPTIONS.map((opt) => {
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onModeChange(opt.value)}
              className="flex-1 border-b-2 py-2 font-body text-[12px] font-medium transition-colors"
              style={{
                color: active ? "var(--ink-strong)" : "var(--ink-soft)",
                borderBottomColor: active ? "var(--emphasis)" : "transparent",
              }}
            >
              {labels[opt.key]}
            </button>
          );
        })}
      </div>

      {mode === "custom" && (
        <div className="flex items-end gap-2">
          <label className="flex-1">
            <span
              className="mb-1 block font-mono text-[11px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {labels.customWidth}
            </span>
            <NumberField
              min={1}
              max={14400}
              fallback={1}
              value={custom.w}
              onCommit={(w) => onCustomChange({ ...custom, w })}
              ariaLabel={labels.customWidth}
              className="w-full rounded-[5px] border px-2.5 py-1.5 font-body text-[12px] tabular-nums outline-none focus:border-[color:var(--emphasis)] focus:ring-1 focus:ring-[color:var(--emphasis)]"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--ink-strong)",
              }}
            />
          </label>
          <span className="pb-2 font-body text-[12px]" style={{ color: "var(--ink-soft)" }}>
            ×
          </span>
          <label className="flex-1">
            <span
              className="mb-1 block font-mono text-[11px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {labels.customHeight}
            </span>
            <NumberField
              min={1}
              max={14400}
              fallback={1}
              value={custom.h}
              onCommit={(h) => onCustomChange({ ...custom, h })}
              ariaLabel={labels.customHeight}
              className="w-full rounded-[5px] border px-2.5 py-1.5 font-body text-[12px] tabular-nums outline-none focus:border-[color:var(--emphasis)] focus:ring-1 focus:ring-[color:var(--emphasis)]"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--ink-strong)",
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
