"use client";

import {
  ASPECT_PRESETS,
  RESIZE_PRESETS,
  type AspectPreset,
  type ResizePreset,
} from "@/lib/image/resizeImage";

export type ActivePreset = { kind: "size" | "ratio"; idx: number } | null;

interface ImageResizePresetsProps {
  sizePresetsTitle: string;
  ratioPresetsTitle: string;
  onSizePreset: (preset: ResizePreset, idx: number) => void;
  onRatioPreset: (preset: AspectPreset, idx: number) => void;
  activePreset: ActivePreset;
}

export function ImageResizePresets({
  sizePresetsTitle,
  ratioPresetsTitle,
  onSizePreset,
  onRatioPreset,
  activePreset,
}: ImageResizePresetsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <PresetColumn title={sizePresetsTitle}>
        {RESIZE_PRESETS.map((p, i) => {
          const active =
            activePreset?.kind === "size" && activePreset.idx === i;
          return (
            <PresetChip
              key={p.label}
              active={active}
              onClick={() => onSizePreset(p, i)}
            >
              {p.label}
            </PresetChip>
          );
        })}
      </PresetColumn>
      <PresetColumn title={ratioPresetsTitle}>
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
      </PresetColumn>
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
