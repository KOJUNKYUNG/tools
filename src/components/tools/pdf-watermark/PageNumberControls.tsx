"use client";

import { template } from "@/lib/common/template";
import { PageRangeSelector } from "@/components/common/PageRangeSelector";
import type { PageNumberOptions } from "@/lib/pdf/applyPdfOverlay";
import type { PageNumberFormat } from "@/lib/pdf/pageNumberFormat";
import type { GridPosition } from "@/lib/pdf/overlayLayout";
import type { PdfWatermarkLabels } from "./labels";
import { PositionGrid } from "./PositionGrid";

// `suffix` is locale-derived and `pages` is the shared selection — both are
// injected at apply time, not edited here.
export type PageNumberState = Omit<PageNumberOptions, "mode" | "suffix" | "pages">;

interface PageNumberControlsProps {
  value: PageNumberState;
  onChange: (patch: Partial<PageNumberState>) => void;
  labels: PdfWatermarkLabels;
  disabled?: boolean;
  // PAGES is the shared page selection. In number mode it renders inline here
  // (right column, under the value fields); watermark mode renders its own.
  totalPages: number;
  selectedPages: Set<number>;
  onSelectedChange: (next: Set<number>) => void;
}

const GROUP_LABEL =
  "font-mono text-[11px] font-medium uppercase tracking-[0.08em]";
const INPUT =
  "h-8 w-full rounded-[6px] border px-2 font-body text-[12px] tabular-nums";
const INPUT_STYLE = {
  borderColor: "var(--border)",
  background: "var(--surface)",
  color: "var(--ink-strong)",
} as const;
const FORMAT_TAB =
  "flex-1 border-b-2 py-2 font-body text-[12px] tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function PageNumberControls({
  value,
  onChange,
  labels,
  disabled,
  totalPages,
  selectedPages,
  onSelectedChange,
}: PageNumberControlsProps) {
  const formats: { value: PageNumberFormat; label: string }[] = [
    { value: "plain", label: labels.formatPlain },
    { value: "fraction", label: labels.formatFraction },
    { value: "dash", label: labels.formatDash },
    { value: "ko", label: labels.formatKo },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        <PositionGrid
          value={value.grid}
          onChange={(grid: GridPosition) => onChange({ grid })}
          label={labels.positionLabel}
          disabled={disabled}
        />
        <div className="flex-1 space-y-3">
          {/* START AT · FONT SIZE · COLOR — one row */}
          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1">
              <span className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
                {labels.startLabel}
              </span>
              <input
                type="number"
                min={0}
                value={value.start}
                disabled={disabled}
                onChange={(e) => onChange({ start: Math.max(0, Number(e.target.value) || 0) })}
                className={INPUT}
                style={INPUT_STYLE}
              />
            </label>
            <label className="space-y-1">
              <span className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
                {labels.fontSizeLabel}
              </span>
              <input
                type="number"
                min={6}
                max={96}
                value={value.fontPx}
                disabled={disabled}
                onChange={(e) => onChange({ fontPx: Math.min(96, Math.max(6, Number(e.target.value) || 12)) })}
                className={INPUT}
                style={INPUT_STYLE}
              />
            </label>
            <label className="space-y-1">
              <span className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
                {labels.colorLabel}
              </span>
              <input
                type="color"
                value={value.color}
                disabled={disabled}
                onChange={(e) => onChange({ color: e.target.value })}
                className="h-8 w-full cursor-pointer rounded-[6px] border"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              />
            </label>
          </div>

          {/* PAGES — shared selection, inline in number mode */}
          {totalPages > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
                  {labels.rangeLabel}
                </span>
                <span className="font-body text-[11px] tabular-nums" style={{ color: "var(--ink)" }}>
                  {template(labels.rangeCountTemplate, { n: selectedPages.size })}
                </span>
              </div>
              <PageRangeSelector
                totalPages={totalPages}
                selected={selectedPages}
                onChange={onSelectedChange}
                inputPlaceholder={labels.rangePlaceholder}
                selectAllLabel={labels.rangeSelectAll}
                clearLabel={labels.rangeClear}
              />
            </div>
          )}
        </div>
      </div>

      {/* FORMAT — bottom, single row, tab-underline (single-select) */}
      <div className="space-y-1.5">
        <p className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
          {labels.formatLabel}
        </p>
        <div className="flex border-b" style={{ borderColor: "var(--hairline)" }}>
          {formats.map((f) => {
            const active = value.format === f.value;
            return (
              <button
                key={f.value}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ format: f.value })}
                className={FORMAT_TAB}
                style={{
                  color: active ? "var(--ink-strong)" : "var(--ink-soft)",
                  borderBottomColor: active ? "var(--emphasis)" : "transparent",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
