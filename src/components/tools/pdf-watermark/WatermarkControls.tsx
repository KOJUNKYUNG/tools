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
  "font-display text-[11px] font-medium uppercase tracking-[0.08em]";
const SEG =
  "nameplate h-8 flex-1 rounded-[7px] px-2 font-display text-[12px] disabled:cursor-not-allowed disabled:opacity-50";

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
    <div className="space-y-3">
      {/* source: text vs image */}
      <div className="flex gap-1.5">
        {(["text", "image"] as const).map((src) => {
          const active = value.source === src;
          return (
            <button
              key={src}
              type="button"
              disabled={disabled}
              data-active={active}
              onClick={() => onChange({ source: src })}
              className={SEG}
              style={active ? undefined : { color: "var(--ink-strong)" }}
            >
              {src === "text" ? labels.sourceText : labels.sourceImage}
            </button>
          );
        })}
      </div>

      {value.source === "text" ? (
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <label className="space-y-1">
            <span className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
              {labels.textLabel}
            </span>
            <input
              type="text"
              value={value.text}
              disabled={disabled}
              placeholder={labels.textPlaceholder}
              onChange={(e) => onChange({ text: e.target.value })}
              className="h-8 w-full rounded-[6px] border px-2 font-body text-[12px]"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink-strong)" }}
            />
          </label>
          <label className="w-16 space-y-1">
            <span className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
              {labels.fontSizeLabel}
            </span>
            <input
              type="number"
              min={8}
              max={200}
              value={value.fontPx}
              disabled={disabled}
              onChange={(e) => onChange({ fontPx: Math.min(200, Math.max(8, Number(e.target.value) || 48)) })}
              className="h-8 w-full rounded-[6px] border px-2 font-body text-[12px] tabular-nums"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink-strong)" }}
            />
          </label>
          <label className="w-10 space-y-1">
            <span className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
              {labels.colorLabel}
            </span>
            <input
              type="color"
              value={value.color}
              disabled={disabled}
              onChange={(e) => onChange({ color: e.target.value })}
              className="h-8 w-full cursor-pointer rounded-[6px] border"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
        </div>
      ) : (
        <div className="space-y-2">
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => logoInputRef.current?.click()}
              className="nameplate h-8 rounded-[7px] px-3 font-display text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ color: "var(--ink-strong)" }}
            >
              {labels.logoSelect}
            </button>
            <span className="min-w-0 flex-1 truncate font-body text-[12px]" style={{ color: "var(--ink-soft)" }}>
              {logoName ?? labels.logoHint}
            </span>
          </div>
          <Slider
            label={labels.logoScaleLabel}
            min={5}
            max={100}
            value={Math.round(value.logoScale * 100)}
            disabled={disabled}
            onChange={(v) => onChange({ logoScale: v / 100 })}
            suffix="%"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
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

      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 font-body text-[12px]" style={{ color: "var(--ink-strong)" }}>
          <input
            type="checkbox"
            checked={value.tile}
            disabled={disabled}
            onChange={(e) => onChange({ tile: e.target.checked })}
          />
          {labels.tileLabel}
        </label>
        {!value.tile && (
          <PositionGrid
            value={value.grid}
            onChange={(grid: GridPosition) => onChange({ grid })}
            label={labels.positionLabel}
            disabled={disabled}
          />
        )}
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
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink-strong)" }}
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
        className="w-full accent-[color:var(--accent-electric)]"
      />
    </div>
  );
}
