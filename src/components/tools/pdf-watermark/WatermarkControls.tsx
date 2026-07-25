"use client";

import { useRef } from "react";
import { toast } from "sonner";
import type { WatermarkOptions } from "@/lib/pdf/applyPdfOverlay";
import type { GridPosition } from "@/lib/pdf/overlayLayout";
import type { PdfWatermarkLabels } from "./labels";
import { PositionGrid } from "./PositionGrid";

// `pages` is the shared selection, injected at apply time — not edited here.
export type WatermarkState = Omit<WatermarkOptions, "mode" | "pages">;

interface WatermarkControlsProps {
  value: WatermarkState;
  onChange: (patch: Partial<WatermarkState>) => void;
  labels: PdfWatermarkLabels;
  /** Display name of the currently picked logo, if any. */
  logoName: string | null;
  onPickLogo: (file: File | null) => void;
  disabled?: boolean;
}

const GROUP_LABEL =
  "font-mono text-[11px] font-medium uppercase tracking-[0.08em]";
const SEG =
  "border-b-2 px-4 py-2 font-body text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function WatermarkControls({
  value,
  onChange,
  labels,
  logoName,
  onPickLogo,
  disabled,
}: WatermarkControlsProps) {
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="space-y-2">
      {/* source: text vs image */}
      <div className="inline-flex border-b" style={{ borderColor: "var(--hairline)" }}>
        {(["text", "image"] as const).map((src) => {
          const active = value.source === src;
          return (
            <button
              key={src}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ source: src })}
              className={SEG}
              style={{
                color: active ? "var(--ink-strong)" : "var(--ink-soft)",
                borderBottomColor: active ? "var(--emphasis)" : "transparent",
              }}
            >
              {src === "text" ? labels.sourceText : labels.sourceImage}
            </button>
          );
        })}
      </div>

      {/* Hidden logo picker — triggered by the Choose-logo button in the grid. */}
      <input
        ref={logoInputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f && !/image\/(png|jpeg)/.test(f.type)) {
            toast.error(labels.logoHint);
            e.target.value = "";
            return;
          }
          onPickLogo(f);
          e.target.value = "";
        }}
      />

      {/* SOURCE INPUT — one skeleton (3-cell row + reserved caption line) so
          switching text↔logo keeps a constant footprint (no rows shift). */}
      <div className="space-y-1">
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          {/* cell 1 — text field / choose-logo */}
          <label className="min-w-0 space-y-1">
            <span className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
              {value.source === "text" ? labels.textLabel : labels.sourceImage}
            </span>
            {value.source === "text" ? (
              <input
                type="text"
                value={value.text}
                disabled={disabled}
                placeholder={labels.textPlaceholder}
                onChange={(e) => onChange({ text: e.target.value })}
                className="h-8 w-full rounded-[6px] border px-2 font-body text-[12px]"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--ink-strong)" }}
              />
            ) : (
              <button
                type="button"
                disabled={disabled}
                onClick={() => logoInputRef.current?.click()}
                className="file-action h-8 w-full truncate rounded-[6px] px-3 text-left font-body text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ color: "var(--ink-strong)" }}
              >
                {labels.logoSelect}
              </button>
            )}
          </label>
          {/* cell 2 — font size / logo scale */}
          <label className="w-16 space-y-1">
            <span className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
              {value.source === "text" ? labels.fontSizeLabel : labels.logoScaleLabel}
            </span>
            {value.source === "text" ? (
              <input
                type="number"
                min={8}
                max={200}
                value={value.fontPx}
                disabled={disabled}
                onChange={(e) => onChange({ fontPx: Math.min(200, Math.max(8, Number(e.target.value) || 48)) })}
                className="h-8 w-full rounded-[6px] border px-2 font-body text-[12px] tabular-nums"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--ink-strong)" }}
              />
            ) : (
              <input
                type="number"
                min={5}
                max={100}
                value={Math.round(value.logoScale * 100)}
                disabled={disabled}
                onChange={(e) => onChange({ logoScale: Math.min(100, Math.max(5, Number(e.target.value) || 40)) / 100 })}
                className="h-8 w-full rounded-[6px] border px-2 font-body text-[12px] tabular-nums"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--ink-strong)" }}
              />
            )}
          </label>
          {/* cell 3 — color (text) / reserved spacer (image) */}
          <label className="w-10 space-y-1">
            <span
              className={GROUP_LABEL}
              style={{ color: "var(--ink-soft)", visibility: value.source === "text" ? "visible" : "hidden" }}
            >
              {labels.colorLabel}
            </span>
            {value.source === "text" ? (
              <input
                type="color"
                value={value.color}
                disabled={disabled}
                onChange={(e) => onChange({ color: e.target.value })}
                className="h-8 w-full cursor-pointer rounded-[6px] border"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              />
            ) : (
              <div className="h-8" aria-hidden="true" />
            )}
          </label>
        </div>
        {/* caption — reserved line; shows the picked logo name in image mode */}
        <span
          className="block h-[15px] truncate font-body text-[11px]"
          style={{ color: "var(--ink-soft)" }}
          title={value.source === "image" ? (logoName ?? labels.logoHint) : undefined}
        >
          {value.source === "image" ? (logoName ?? labels.logoHint) : " "}
        </span>
      </div>

      {/*
        Fixed 2-column layout, identical for text + image modes:
          LEFT  — opacity over rotation (stacked)
          RIGHT — tile-repeat toggle over the position grid
        The position grid is ALWAYS rendered (dimmed + disabled while tiling),
        so toggling tile repeat never changes the height — no layout jump, no
        scrollbar appearing/disappearing.
      */}
      <div className="grid grid-cols-2 gap-x-4">
        <div className="space-y-3">
          <Slider
            label={labels.opacityLabel}
            min={5}
            max={100}
            value={Math.round(value.opacity * 100)}
            disabled={disabled}
            onChange={(v) => onChange({ opacity: v / 100 })}
            suffix="%"
          />
          <Slider
            label={labels.angleLabel}
            min={-90}
            max={90}
            value={value.angle}
            disabled={disabled}
            onChange={(v) => onChange({ angle: v })}
            suffix="°"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <label
              className="flex shrink-0 items-center gap-2 font-body text-[12px]"
              style={{ color: "var(--ink-strong)" }}
            >
              <input
                type="checkbox"
                checked={value.tile}
                disabled={disabled}
                onChange={(e) => onChange({ tile: e.target.checked })}
              />
              {labels.tileLabel}
            </label>
            {/* Tile spacing rides the checkbox row (reserved) so toggling tile
                never changes the column height. */}
            <input
              type="range"
              min={10}
              max={300}
              value={Math.round(value.tileGap * 100)}
              disabled={disabled || !value.tile}
              onChange={(e) => onChange({ tileGap: Number(e.target.value) / 100 })}
              className="min-w-0 flex-1 accent-[color:var(--emphasis)]"
              style={{ visibility: value.tile ? "visible" : "hidden" }}
              aria-label={labels.tileGapLabel}
            />
          </div>
          {/* Position grid: always rendered (dimmed while tiling, which ignores
              the anchor) so tile toggle never shifts the layout. */}
          <div style={{ opacity: value.tile ? 0.4 : 1 }} aria-hidden={value.tile}>
            <PositionGrid
              value={value.grid}
              onChange={(grid: GridPosition) => onChange({ grid, position: null })}
              label={labels.positionLabel}
              disabled={disabled || value.tile}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface SliderProps {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  disabled?: boolean;
}

function Slider({ label, min, max, value, onChange, suffix, disabled }: SliderProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
          {label}
        </span>
        <span className="flex items-center gap-0.5">
          <input
            type="number"
            min={min}
            max={max}
            value={value}
            disabled={disabled}
            onChange={(e) => {
              const raw = Number(e.target.value);
              if (Number.isFinite(raw)) onChange(clamp(raw));
            }}
            className="h-6 w-12 rounded-[5px] border px-1 text-right font-body text-[11px] tabular-nums"
            style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--ink-strong)" }}
          />
          {suffix && (
            <span className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
              {suffix}
            </span>
          )}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[color:var(--emphasis)]"
      />
    </div>
  );
}
