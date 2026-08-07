"use client";

import { useRef } from "react";
import { toast } from "sonner";
import type { WatermarkOptions } from "@/lib/pdf/applyPdfOverlay";
import type { GridPosition } from "@/lib/pdf/overlayLayout";
import { NumberField } from "@/components/common/NumberField";
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
  "font-mono text-[11px] font-medium uppercase tracking-[0.08em] whitespace-nowrap";
const SEG =
  "border-b-2 px-4 py-2 font-body text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const INPUT_STYLE = {
  borderColor: "var(--border)",
  background: "var(--surface-2)",
  color: "var(--ink-strong)",
} as const;

export function WatermarkControls({
  value,
  onChange,
  labels,
  logoName,
  onPickLogo,
  disabled,
}: WatermarkControlsProps) {
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const isText = value.source === "text";
  const isImage = value.source === "image";

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

      {/* Hidden logo picker — triggered by the Choose-logo button below. */}
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

      {/* SOURCE INPUT — the text and logo controls share ONE grid cell: both are
          always laid out (only the active one is visible), so the slot is always
          as tall as the taller mode. Switching source cannot change the height —
          no reserved pixels, no shift by construction. */}
      <div className="grid items-start">
        {/* TEXT — text field + font + color */}
        <div
          className={`col-start-1 row-start-1 grid grid-cols-[1fr_auto_auto] gap-2${
            isText ? "" : " invisible pointer-events-none"
          }`}
          aria-hidden={!isText}
        >
          <label className="min-w-0 space-y-1">
            <span className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
              {labels.textLabel}
            </span>
            <input
              type="text"
              value={value.text}
              disabled={disabled || !isText}
              placeholder={labels.textPlaceholder}
              onChange={(e) => onChange({ text: e.target.value })}
              className="h-8 w-full rounded-[6px] border px-2 font-body text-[12px]"
              style={INPUT_STYLE}
            />
          </label>
          <label className="w-16 space-y-1">
            <span className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
              {labels.fontSizeLabel}
            </span>
            <NumberField
              value={value.fontPx}
              onCommit={(fontPx) => onChange({ fontPx })}
              min={8}
              max={400}
              fallback={48}
              disabled={disabled || !isText}
              className="h-8 w-full rounded-[6px] border px-2 font-body text-[12px] tabular-nums"
              style={INPUT_STYLE}
            />
          </label>
          <label className="w-10 space-y-1">
            <span className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
              {labels.colorLabel}
            </span>
            <input
              type="color"
              value={value.color}
              disabled={disabled || !isText}
              onChange={(e) => onChange({ color: e.target.value })}
              className="h-8 w-full cursor-pointer rounded-[6px] border"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
            />
          </label>
        </div>
        {/* LOGO — choose button + scale, with the picked file name below */}
        <div
          className={`col-start-1 row-start-1 space-y-1${
            isImage ? "" : " invisible pointer-events-none"
          }`}
          aria-hidden={!isImage}
        >
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="min-w-0 space-y-1">
              <span className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
                {labels.sourceImage}
              </span>
              <button
                type="button"
                disabled={disabled || !isImage}
                onClick={() => logoInputRef.current?.click()}
                className="file-action h-8 w-full truncate rounded-[6px] px-3 text-center font-body text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ color: "var(--ink-strong)" }}
              >
                {labels.logoSelect}
              </button>
            </label>
            <label className="w-16 space-y-1">
              <span className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
                {labels.logoScaleLabel}
              </span>
              <NumberField
                value={Math.round(value.logoScale * 100)}
                onCommit={(pct) => onChange({ logoScale: pct / 100 })}
                min={5}
                max={200}
                fallback={40}
                disabled={disabled || !isImage}
                className="h-8 w-full rounded-[6px] border px-2 font-body text-[12px] tabular-nums"
                style={INPUT_STYLE}
              />
            </label>
          </div>
          <span
            className="block truncate font-body text-[11px]"
            style={{ color: "var(--ink-soft)" }}
            title={logoName ?? labels.logoHint}
          >
            {logoName ?? labels.logoHint}
          </span>
        </div>
      </div>

      {/* Fixed 2-column body, identical for both sources:
          LEFT  — opacity over rotation
          RIGHT — tile toggle over the position-grid / tile-spacing slot */}
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
          <label
            className="flex items-center gap-2 font-body text-[12px]"
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
          {/* The position grid (preset) and the tile-spacing slider share ONE
              grid cell — both always laid out, only the active one visible — so
              the slot is always as tall as the grid. Toggling tile can't shift
              the layout, with no reserved pixels. A tiled mark ignores the
              anchor, so tiling shows spacing instead of position. */}
          <div className="grid items-start">
            <div
              className={`col-start-1 row-start-1${value.tile ? " invisible pointer-events-none" : ""}`}
              aria-hidden={value.tile}
            >
              <PositionGrid
                value={value.grid}
                onChange={(grid: GridPosition) => onChange({ grid, position: null })}
                label={labels.positionLabel}
                disabled={disabled || value.tile}
              />
            </div>
            <div
              className={`col-start-1 row-start-1${value.tile ? "" : " invisible pointer-events-none"}`}
              aria-hidden={!value.tile}
            >
              <Slider
                label={labels.tileGapLabel}
                min={-50}
                max={300}
                value={Math.round(value.tileGap * 100)}
                disabled={disabled || !value.tile}
                onChange={(v) => onChange({ tileGap: v / 100 })}
                suffix="%"
              />
            </div>
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
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
          {label}
        </span>
        <span className="flex items-center gap-0.5">
          <NumberField
            value={value}
            onCommit={onChange}
            min={min}
            max={max}
            disabled={disabled}
            ariaLabel={label}
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
