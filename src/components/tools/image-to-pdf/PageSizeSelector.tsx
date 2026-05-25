"use client";

export type PageSizeMode = "fit" | "a4" | "custom";

export interface CustomSize {
  /** Page width in px (mapped 1px → 1pt at assemble time). */
  w: string;
  /** Page height in px. */
  h: string;
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
        className="font-display text-[11px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--ink-soft)" }}
      >
        {labels.sizeLabel}
      </p>
      <div className="flex gap-1.5">
        {OPTIONS.map((opt) => {
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onModeChange(opt.value)}
              data-active={active}
              className="nameplate h-8 flex-1 rounded-[9px] px-3 font-display text-[12px] font-medium"
              style={active ? undefined : { color: "var(--ink-strong)" }}
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
              className="mb-1 block font-display text-[11px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {labels.customWidth}
            </span>
            <input
              type="number"
              min={1}
              value={custom.w}
              onChange={(e) => onCustomChange({ ...custom, w: e.target.value })}
              className="w-full rounded-[5px] border px-2.5 py-1.5 font-display text-[12px] outline-none focus:border-[color:var(--accent-electric)] focus:ring-1 focus:ring-[color:var(--accent-electric)]"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--ink-strong)",
              }}
            />
          </label>
          <span className="pb-2 font-display text-[12px]" style={{ color: "var(--ink-soft)" }}>
            ×
          </span>
          <label className="flex-1">
            <span
              className="mb-1 block font-display text-[11px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {labels.customHeight}
            </span>
            <input
              type="number"
              min={1}
              value={custom.h}
              onChange={(e) => onCustomChange({ ...custom, h: e.target.value })}
              className="w-full rounded-[5px] border px-2.5 py-1.5 font-display text-[12px] outline-none focus:border-[color:var(--accent-electric)] focus:ring-1 focus:ring-[color:var(--accent-electric)]"
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
