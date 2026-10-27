"use client";

import { CheckIcon, PipetteIcon } from "lucide-react";
import type { NewBackground } from "@/lib/ppt/changeBackground";

/** A background that is not a picture: a solid colour, or none (the theme's). */
export type FillBackground = Exclude<NewBackground, { kind: "picture" }>;

/** The preset colours, in grid order. [임시] list: the user settles it. */
export const SOLID_PRESETS = [
  { id: "black", rgb: "000000" },
  { id: "white", rgb: "FFFFFF" },
  { id: "navy", rgb: "1F2A44" },
  { id: "charcoal", rgb: "3A3A3A" },
  { id: "lightGrey", rgb: "E7E6E6" },
  { id: "ivory", rgb: "F5F0E6" },
  { id: "wine", rgb: "6B1E2E" },
  { id: "forest", rgb: "1E4D3A" },
  { id: "skyBlue", rgb: "DCEAF7" },
  { id: "blush", rgb: "F6E1E1" },
] as const;

export type SolidPresetId = (typeof SOLID_PRESETS)[number]["id"];

export interface SolidColourLabels {
  none: string;
  noneHint: string;
  custom: string;
  colours: Record<SolidPresetId, string>;
}

interface SolidColourGridProps {
  value: FillBackground | null;
  onSelect: (fill: FillBackground) => void;
  /** The colour "no background" shows on this deck (`#rrggbb`); unknown until the deck is read. */
  themeBackground: string | null;
  /** The last colour picked with "직접 선택", as six hex digits. */
  custom: string | null;
  onCustom: (rgb: string) => void;
  /** A run is using the pick: shown as is and nothing responds. */
  locked: boolean;
  labels: SolidColourLabels;
}

/**
 * The "단색" tab: "no background", the preset colours, then a free pick. A
 * pick applies as is (no crop step). Tiles share the gallery's grid, size and
 * selection marks, so switching tabs never resizes the pane.
 */
export function SolidColourGrid({
  value,
  onSelect,
  themeBackground,
  custom,
  onCustom,
  locked,
  labels,
}: SolidColourGridProps) {
  const selectedRgb = value?.kind === "colour" ? value.rgb : null;
  const presetSelected = SOLID_PRESETS.some((p) => p.rgb === selectedRgb);

  return (
    <div
      className="grid h-full min-h-0 grid-cols-2 gap-2 overflow-y-auto px-4 pb-3 pt-3 sm:grid-cols-3"
      style={{ gridAutoRows: "min-content", alignContent: "start" }}
    >
      <Tile
        label={labels.none}
        title={labels.noneHint}
        colour={themeBackground ?? "#ffffff"}
        selected={value?.kind === "none"}
        disabled={locked}
        onClick={() => onSelect({ kind: "none" })}
      />
      {SOLID_PRESETS.map((p) => (
        <Tile
          key={p.id}
          label={labels.colours[p.id]}
          colour={`#${p.rgb}`}
          selected={selectedRgb === p.rgb}
          disabled={locked}
          onClick={() => onSelect({ kind: "colour", rgb: p.rgb })}
        />
      ))}
      <Tile
        label={labels.custom}
        colour={custom ? `#${custom}` : null}
        selected={selectedRgb !== null && !presetSelected}
        disabled={locked}
        // The native picker opens over the tile; picking the colour it
        // already holds fires no change, so a click re-selects it.
        onClick={() => custom && onSelect({ kind: "colour", rgb: custom })}
        picker={{
          value: `#${(custom ?? "FFFFFF").toLowerCase()}`,
          onChange: (hex) => {
            const rgb = hex.replace("#", "").toUpperCase();
            onCustom(rgb);
            onSelect({ kind: "colour", rgb });
          },
        }}
      />
    </div>
  );
}

function Tile({
  label,
  title,
  colour,
  selected,
  disabled,
  onClick,
  picker,
}: {
  label: string;
  title?: string;
  /** The swatch's CSS colour; null shows the picker glyph. */
  colour: string | null;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  /** Makes the tile a native colour input. */
  picker?: { value: string; onChange: (hex: string) => void };
}) {
  const body = (
    <>
      <div className="relative aspect-video overflow-hidden">
        <div
          className="flex size-full items-center justify-center"
          style={{ background: colour ?? "var(--surface-2)", color: "var(--ink-soft)" }}
        >
          {colour === null && <PipetteIcon className="size-4" aria-hidden="true" />}
        </div>
        {selected && (
          <div
            className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full"
            style={{ background: "var(--emphasis)", color: "var(--surface)" }}
          >
            <CheckIcon className="size-3" />
          </div>
        )}
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate font-body text-[11px] font-medium" style={{ color: "var(--ink-strong)" }}>
          {label}
        </p>
      </div>
    </>
  );
  const className = "group relative overflow-hidden rounded-[6px] border text-left transition-colors disabled:cursor-default";
  const style = {
    background: "var(--surface-2)",
    borderColor: "var(--border)",
    borderWidth: 1,
    outline: selected ? "2px solid var(--emphasis)" : undefined,
    outlineOffset: selected ? "-2px" : undefined,
  };

  if (picker) {
    return (
      <label className={className} style={style} title={title}>
        {body}
        <input
          type="color"
          value={picker.value}
          onChange={(e) => picker.onChange(e.target.value)}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
        />
      </label>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      title={title}
      className={className}
      style={style}
    >
      {body}
    </button>
  );
}
