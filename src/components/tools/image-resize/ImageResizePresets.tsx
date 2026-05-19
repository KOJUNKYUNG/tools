"use client";

import {
  ASPECT_PRESETS,
  RESIZE_PRESETS,
  type AspectPreset,
  type ResizePreset,
} from "@/lib/image/resizeImage";

interface ImageResizePresetsProps {
  sizePresetsTitle: string;
  ratioPresetsTitle: string;
  onSizePreset: (preset: ResizePreset) => void;
  onRatioPreset: (preset: AspectPreset) => void;
}

export function ImageResizePresets({
  sizePresetsTitle,
  ratioPresetsTitle,
  onSizePreset,
  onRatioPreset,
}: ImageResizePresetsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <PresetColumn title={sizePresetsTitle}>
        {RESIZE_PRESETS.map((p) => (
          <PresetChip key={p.label} onClick={() => onSizePreset(p)}>
            {p.label}
          </PresetChip>
        ))}
      </PresetColumn>
      <PresetColumn title={ratioPresetsTitle}>
        {ASPECT_PRESETS.map((p) => (
          <PresetChip key={p.label} onClick={() => onRatioPreset(p)}>
            {p.label}
          </PresetChip>
        ))}
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
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[5px] border px-2.5 py-1 font-display text-[11.5px] transition-colors hover:border-[color:var(--accent-electric)]"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        color: "var(--ink-strong)",
      }}
    >
      {children}
    </button>
  );
}
