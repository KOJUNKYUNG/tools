"use client";

import {
  ASPECT_PRESETS,
  RESIZE_PRESETS,
  type AspectPreset,
  type ResizePreset,
} from "@/lib/image/resizeImage";

export type ActivePreset =
  | { kind: "size"; idx: number }
  | { kind: "ratio"; idx: number }
  | { kind: "custom" }
  | null;

interface ImageResizePresetsProps {
  sizePresetsTitle: string;
  ratioPresetsTitle: string;
  sizePresetLabels: Record<string, string>;
  onSizePreset: (preset: ResizePreset, idx: number) => void;
  onRatioPreset: (preset: AspectPreset, idx: number) => void;
  activePreset: ActivePreset;
  customLabel: string;
  customOpen: boolean;
  customRatio: { w: string; h: string } | null;
  onCustomToggle: () => void;
  onCustomRatioInput: (w: string, h: string) => void;
  onCustomRatioCommit: () => void;
}

export function ImageResizePresets({
  sizePresetsTitle,
  ratioPresetsTitle,
  sizePresetLabels,
  onSizePreset,
  onRatioPreset,
  activePreset,
  customLabel,
  customOpen,
  customRatio,
  onCustomToggle,
  onCustomRatioInput,
  onCustomRatioCommit,
}: ImageResizePresetsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <PresetColumn title={sizePresetsTitle}>
        {RESIZE_PRESETS.map((p, i) => {
          const active =
            activePreset?.kind === "size" && activePreset.idx === i;
          return (
            <PresetChip
              key={p.labelKey}
              active={active}
              onClick={() => onSizePreset(p, i)}
            >
              {sizePresetLabels[p.labelKey] ?? p.labelKey}
            </PresetChip>
          );
        })}
      </PresetColumn>
      <div className="space-y-2">
        <p
          className="font-display text-[11.5px] font-medium"
          style={{ color: "var(--ink-soft)" }}
        >
          {ratioPresetsTitle}
        </p>
        <div className="flex items-center gap-1.5">
          <PresetChip
            active={activePreset?.kind === "custom"}
            onClick={onCustomToggle}
          >
            {customLabel}
          </PresetChip>
          {customOpen && (
            <span className="inline-flex items-center gap-1">
              <input
                type="number"
                min={1}
                value={customRatio?.w ?? ""}
                onChange={(e) =>
                  onCustomRatioInput(e.target.value, customRatio?.h ?? "")
                }
                onBlur={() => onCustomRatioCommit()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className="w-12 rounded-[5px] border px-1.5 py-1 font-display text-[11.5px] outline-none focus:border-[color:var(--accent-electric)]"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--ink-strong)",
                }}
                aria-label="ratio width"
              />
              <span style={{ color: "var(--ink-soft)" }}>:</span>
              <input
                type="number"
                min={1}
                value={customRatio?.h ?? ""}
                onChange={(e) =>
                  onCustomRatioInput(customRatio?.w ?? "", e.target.value)
                }
                onBlur={() => onCustomRatioCommit()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className="w-12 rounded-[5px] border px-1.5 py-1 font-display text-[11.5px] outline-none focus:border-[color:var(--accent-electric)]"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--ink-strong)",
                }}
                aria-label="ratio height"
              />
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ASPECT_PRESETS.map((p, i) => {
            const active =
              activePreset?.kind === "ratio" && activePreset.idx === i;
            return (
              <PresetChip
                key={p.label}
                active={active}
                onClick={() => onRatioPreset(p, i)}
              >
                {p.label}
              </PresetChip>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PresetColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p
        className="font-display text-[11.5px] font-medium"
        style={{ color: "var(--ink-soft)" }}
      >
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function PresetChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[5px] border px-2.5 py-1 font-display text-[11.5px] transition-colors hover:border-[color:var(--accent-electric)]"
      style={
        active
          ? {
              background: "var(--accent-electric)",
              borderColor: "var(--accent-electric)",
              color: "#fff",
            }
          : {
              background: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--ink-strong)",
            }
      }
    >
      {children}
    </button>
  );
}
