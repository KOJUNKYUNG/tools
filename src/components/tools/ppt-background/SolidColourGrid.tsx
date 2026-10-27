"use client";

import { useEffect, useRef } from "react";
import { PipetteIcon } from "lucide-react";
import { galleryTileClass, galleryTileStyle, TileSelectionMark } from "@/components/ppt/GalleryTile";
import type { FillBackground } from "@/lib/ppt/changeBackground";

/**
 * The preset colours, in grid order: white through the light colours, then
 * the dark colours, the most saturated first, down to black. [임시] list: the
 * user settles it.
 */
export const SOLID_PRESETS = [
  { id: "white", rgb: "FFFFFF" },
  { id: "ivory", rgb: "F5F0E6" },
  { id: "lightGrey", rgb: "E7E6E6" },
  { id: "skyBlue", rgb: "DCEAF7" },
  { id: "blush", rgb: "F6E1E1" },
  { id: "wine", rgb: "6B1E2E" },
  { id: "forest", rgb: "1E4D3A" },
  { id: "navy", rgb: "1F2A44" },
  { id: "charcoal", rgb: "3A3A3A" },
  { id: "black", rgb: "000000" },
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
  /** `fromCustom`: picked with "직접 선택", which then shows as the pick even for a preset's colour. */
  onSelect: (fill: FillBackground, fromCustom: boolean) => void;
  /** The colour "no background" shows on this deck (`#rrggbb`). */
  themeBackground: string;
  /** The last colour picked with "직접 선택", as six hex digits. */
  custom: string | null;
  /** The current pick came from "직접 선택". */
  customPicked: boolean;
  onCustom: (rgb: string) => void;
  /** A run is using the pick: shown as is and nothing responds. */
  locked: boolean;
  labels: SolidColourLabels;
}

/**
 * The "단색" tab: a free pick, "no background", then the preset colours. A
 * pick applies as is (no crop step). Tiles share the gallery's grid, size and
 * selection marks, so switching tabs never resizes the pane.
 */
export function SolidColourGrid({
  value,
  onSelect,
  themeBackground,
  custom,
  customPicked,
  onCustom,
  locked,
  labels,
}: SolidColourGridProps) {
  const selectedRgb = value?.kind === "colour" ? value.rgb : null;
  // A colour picked with "직접 선택" selects that tile, even when a preset has it.
  const customSelected =
    selectedRgb !== null &&
    selectedRgb === custom &&
    (customPicked || !SOLID_PRESETS.some((p) => p.rgb === selectedRgb));
  const selectedKey = customSelected ? "custom" : value?.kind === "none" ? "none" : selectedRgb;

  // The pick stays in view: back on this tab, or under a run, a pick lower
  // down (black) would otherwise sit below the fold. Only the grid scrolls.
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const grid = gridRef.current;
    const tile = grid?.querySelector<HTMLElement>('[data-selected="true"]');
    if (!grid || !tile) return;
    const top = tile.getBoundingClientRect().top - grid.getBoundingClientRect().top + grid.scrollTop;
    if (top < grid.scrollTop) grid.scrollTop = top;
    else if (top + tile.offsetHeight > grid.scrollTop + grid.clientHeight) {
      grid.scrollTop = top + tile.offsetHeight - grid.clientHeight + 12;
    }
  }, [selectedKey]);

  return (
    <div
      ref={gridRef}
      className="grid h-full min-h-0 grid-cols-2 gap-2 overflow-y-auto px-4 pb-3 pt-3 sm:grid-cols-3"
      style={{ gridAutoRows: "min-content", alignContent: "start" }}
    >
      <Tile
        label={labels.custom}
        colour={custom ? `#${custom}` : null}
        selected={customSelected}
        disabled={locked}
        // The native picker opens over the tile; picking the colour it
        // already holds fires no change, so a click re-selects it.
        onClick={() => custom && onSelect({ kind: "colour", rgb: custom }, true)}
        picker={{
          // A first pick starts from the current colour, else mid grey: the
          // picker reports only a change, so its starting colour cannot be
          // picked as is.
          value: `#${(custom ?? selectedRgb ?? "808080").toLowerCase()}`,
          onChange: (hex) => {
            const rgb = hex.replace("#", "").toUpperCase();
            onCustom(rgb);
            onSelect({ kind: "colour", rgb }, true);
          },
        }}
      />
      <Tile
        label={labels.none}
        title={labels.noneHint}
        colour={themeBackground}
        none
        selected={value?.kind === "none"}
        disabled={locked}
        onClick={() => onSelect({ kind: "none" }, false)}
      />
      {SOLID_PRESETS.map((p) => (
        <Tile
          key={p.id}
          label={labels.colours[p.id]}
          colour={`#${p.rgb}`}
          selected={!customSelected && selectedRgb === p.rgb}
          disabled={locked}
          onClick={() => onSelect({ kind: "colour", rgb: p.rgb }, false)}
        />
      ))}
    </div>
  );
}

function Tile({
  label,
  title,
  colour,
  none = false,
  selected,
  disabled,
  onClick,
  picker,
}: {
  label: string;
  title?: string;
  /** The swatch's CSS colour (`#rrggbb`); null shows the picker glyph. */
  colour: string | null;
  /** Crosses the swatch with a slash, Office's mark for "no fill". */
  none?: boolean;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  /** Makes the tile a native colour input. */
  picker?: { value: string; onChange: (hex: string) => void };
}) {
  const body = (
    <>
      {/* A hairline under the swatch keeps a light colour, or the empty
          picker well, apart from the caption. */}
      <div className="relative aspect-video overflow-hidden border-b" style={{ borderColor: "var(--border)" }}>
        <div
          className="flex size-full items-center justify-center"
          style={{
            background: colour
              ? none
                ? `${slash(colour)}, ${colour}`
                : colour
              : "var(--surface-2)",
            color: "var(--ink-soft)",
          }}
        >
          {colour === null && <PipetteIcon className="size-4" aria-hidden="true" />}
        </div>
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate font-body text-[11px] font-medium" style={{ color: "var(--ink-strong)" }}>
          {label}
        </p>
      </div>
      {selected && <TileSelectionMark />}
    </>
  );
  const className = `${galleryTileClass} disabled:cursor-default`;
  const marks = { "data-selected": selected };
  const style = galleryTileStyle(selected);

  if (picker) {
    return (
      <label className={className} style={style} title={title} {...marks}>
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
      {...marks}
      title={title}
      className={className}
      style={style}
    >
      {body}
    </button>
  );
}

/** A thin diagonal line across the swatch, dark on a light colour and light on a dark one. */
function slash(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const ink = 0.299 * r + 0.587 * g + 0.114 * b > 140 ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.55)";
  return `linear-gradient(to top right, transparent calc(50% - 0.75px), ${ink} calc(50% - 0.75px), ${ink} calc(50% + 0.75px), transparent calc(50% + 0.75px))`;
}
