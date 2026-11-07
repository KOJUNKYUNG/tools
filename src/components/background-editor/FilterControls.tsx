"use client";

import { useId, useState } from "react";
import { ShuffleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveFilter, FilterSet, OfferedFilters } from "@/lib/image/filterSet";
import {
  isPaperFilter,
  nextPattern,
  settingShown,
  settingsOf,
  settingValues,
  type PaperFilter,
  type PaperSetting,
  type PaperValue,
} from "@/lib/image/paperFilters";
import { GROUP_LABEL, LABEL_BOX, SliderCell } from "./SliderCell";

/**
 * Copy of the effects group. `common.errors.filterDrawFailed` names the
 * style and "none" labels: it changes with them.
 */
export interface FilterLabels {
  /** The filter set's group in the edit area. */
  effects: string;
  /** The group's three parts. */
  tabs: Record<FilterTab, string>;
  blur: string;
  saturation: string;
  contrast: string;
  /** The one-of choice of Paper filter. */
  paper: string;
  /** The choice of no Paper filter. */
  paperNone: string;
  /** Each Paper filter's name. */
  paperFilters: Record<PaperFilter, string>;
  /** The Paper filter's strength slider. */
  strength: string;
  /** Puts the chosen Paper filter's strength and settings back to their defaults. */
  paperDefaults: string;
  /** Each Paper setting's name, by prop. */
  settings: Record<string, string>;
  /** The glass shapes' names, by Paper's option. */
  shapes: Record<string, string>;
  /** The colour overlay's slider. */
  overlay: string;
  /** The colour overlay's colour picker. */
  overlayColour: string;
  /** The light or dark veil slider. */
  veil: string;
  /** The veil in the summary of what is laid, by its way. */
  darken: string;
  lighten: string;
  grain: string;
  grainSize: string;
  grainColour: string;
  grainResponse: string;
  /** Clears every filter. */
  reset: string;
}

/**
 * The effects group's parts: the colour and tone (the adjustments and the
 * overlays, laid before and after the style), the Paper style, grain.
 */
type FilterTab = "adjust" | "style" | "grain";
const TABS: readonly FilterTab[] = ["adjust", "style", "grain"];

/** The filter set's controls, the "effects" group of a picture's edit area (CONTEXT "Filter set"). */
export interface FilterControlsProps {
  offered: OfferedFilters;
  filters: FilterSet;
  onChange: (change: Partial<FilterSet>) => void;
  /** A run uses the pick: shown as is, nothing responds. */
  locked: boolean;
  labels: FilterLabels;
}

/** The filters laid, by name, in the plan's order: the edit area's summary of the effects in use. */
export function filterSummary(active: ActiveFilter[], labels: FilterLabels): string {
  return active.map((filter) => (isPaperFilter(filter) ? labels.paperFilters[filter] : labels[filter])).join(" · ");
}

/** A selected toggle: the underline (DESIGN.md). */
const toggleStyle = (chosen: boolean) => ({
  color: chosen ? "var(--ink-strong)" : "var(--ink-soft)",
  borderBottomColor: chosen ? "var(--emphasis)" : "transparent",
});
const TOGGLE = "truncate border-b-2 px-1.5 py-0.5 font-body text-[11px] font-medium transition-colors";
/** A control's row: one cell of the two-column grid, or both. */
const CELL = "flex h-6 min-w-0 items-center gap-1.5";

export function FilterControls({ offered, filters, onChange, locked, labels }: FilterControlsProps) {
  // The part shown: the room under the picture fits one at a time.
  const [tab, setTab] = useState<FilterTab>("adjust");
  const paperOffer = offered.paper;
  // The style part holds only the Paper filters, which need WebGL2.
  const tabs = TABS.filter((t) => t !== "style" || paperOffer);
  const shown = tabs.includes(tab) ? tab : tabs[0];
  const paper = filters.paper && paperOffer?.filters.includes(filters.paper) ? filters.paper : null;
  // The chosen style differs from its defaults: its reset has something to undo.
  const paperValues = paper ? settingValues(paper, filters.paperSettings) : null;
  const paperEdited =
    !!paper &&
    (filters.paperStrength !== 1 ||
      Object.entries(settingsOf(paper)).some(([prop, setting]) => paperValues?.[prop] !== setting.default));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-6 min-w-0 items-center gap-2">
        <div role="tablist" aria-label={labels.effects} className="flex min-w-0 items-center gap-0.5">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={t === shown}
              onClick={() => setTab(t)}
              className={TOGGLE}
              style={toggleStyle(t === shown)}
            >
              {labels.tabs[t]}
            </button>
          ))}
        </div>
        {shown === "style" && paper && (
          <button
            type="button"
            onClick={() => {
              const { [paper]: _dropped, ...others } = filters.paperSettings;
              onChange({ paperStrength: 1, paperSettings: others });
            }}
            disabled={locked || !paperEdited}
            className="subtle-action ml-auto shrink-0 rounded-[5px] px-2 py-0.5 font-body text-[11px]"
          >
            {labels.paperDefaults}
          </button>
        )}
      </div>
      {/* Two controls a row, as the recipe edit's. */}
      <div
        role="tabpanel"
        aria-label={labels.tabs[shown]}
        className="grid gap-x-3 gap-y-1.5"
        style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
      >
        {shown === "adjust" && (
          <>
            {offered.blur && (
              <SliderCell
                label={labels.blur}
                range={offered.blur}
                value={filters.blur}
                locked={locked}
                onChange={(value) => onChange({ blur: value })}
              />
            )}
            <SliderCell
              label={labels.saturation}
              range={offered.saturation}
              value={filters.saturation}
              locked={locked}
              onChange={(value) => onChange({ saturation: value })}
            />
            <SliderCell
              label={labels.contrast}
              range={offered.contrast}
              value={filters.contrast}
              locked={locked}
              onChange={(value) => onChange({ contrast: value })}
            />
            <SliderCell
              label={labels.veil}
              range={offered.veil}
              value={filters.veil}
              locked={locked}
              onChange={(value) => onChange({ veil: value })}
            />
            <SliderCell
              label={labels.overlay}
              range={offered.overlay}
              value={filters.overlay}
              locked={locked}
              onChange={(value) => onChange({ overlay: value })}
              lead={
                <Swatch
                  colour={filters.overlayColour}
                  label={labels.overlayColour}
                  locked={locked}
                  onColour={(hex) => onChange({ overlayColour: hex })}
                  small
                />
              }
            />
          </>
        )}
        {shown === "style" && paperOffer && (
          <>
            {/* A single-select across the row; too narrow for every name (a
                phone, longer copy), it wraps rather than cut one. */}
            <div role="group" aria-label={labels.paper} className={cn(CELL, "col-span-2")}>
              <span className={cn(GROUP_LABEL, LABEL_BOX)} style={{ color: "var(--ink-soft)" }} aria-hidden="true">
                {labels.paper}
              </span>
              <div className="flex min-w-0 flex-wrap gap-0.5">
                {[null, ...paperOffer.filters].map((filter) => (
                  <button
                    key={filter ?? "none"}
                    type="button"
                    aria-pressed={paper === filter}
                    onClick={() => onChange({ paper: filter })}
                    disabled={locked}
                    className={TOGGLE}
                    style={toggleStyle(paper === filter)}
                  >
                    {filter ? labels.paperFilters[filter] : labels.paperNone}
                  </button>
                ))}
              </div>
            </div>
            <SliderCell
              label={labels.strength}
              range={paperOffer.strength}
              value={filters.paperStrength}
              // The strength of no filter does nothing.
              locked={locked || !paper}
              onChange={(value) => onChange({ paperStrength: value })}
            />
            {paper && (
              <PaperSettingCells
                filter={paper}
                filters={filters}
                onChange={onChange}
                locked={locked}
                labels={labels}
              />
            )}
          </>
        )}
        {shown === "grain" && (
          <>
            <SliderCell
              label={labels.grain}
              range={offered.grain}
              value={filters.grain}
              locked={locked}
              onChange={(value) => onChange({ grain: value })}
            />
            {/* How the grain looks does nothing without grain. */}
            <SliderCell
              label={labels.grainSize}
              range={offered.grainSize}
              value={filters.grainSize}
              locked={locked || filters.grain === 0}
              onChange={(value) => onChange({ grainSize: value })}
            />
            <SliderCell
              label={labels.grainColour}
              range={offered.grainColour}
              value={filters.grainColour}
              locked={locked || filters.grain === 0}
              onChange={(value) => onChange({ grainColour: value })}
            />
            <ToggleCell
              label={labels.grainResponse}
              checked={filters.grainResponse}
              locked={locked || filters.grain === 0}
              onChange={(checked) => onChange({ grainResponse: checked })}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The chosen Paper filter's settings, one cell each; its colours side by
 * side in one cell, so every filter's settings fit two rows beside its
 * strength.
 */
function PaperSettingCells({
  filter,
  filters,
  onChange,
  locked,
  labels,
}: {
  filter: PaperFilter;
  filters: FilterSet;
  onChange: (change: Partial<FilterSet>) => void;
  locked: boolean;
  labels: Pick<FilterLabels, "settings" | "shapes">;
}) {
  const values = settingValues(filter, filters.paperSettings);
  const set = (prop: string, value: PaperValue) =>
    onChange({ paperSettings: { ...filters.paperSettings, [filter]: { ...filters.paperSettings[filter], [prop]: value } } });
  const shownSettings = Object.entries(settingsOf(filter)).filter(([prop]) => settingShown(filter, prop, values));
  const colours = shownSettings.filter(([, setting]) => setting.kind === "colour");
  const cells = shownSettings.filter(([, setting]) => setting.kind !== "colour");
  return (
    <>
      {cells.map(([prop, setting]) => (
        <SettingCell
          key={prop}
          label={labels.settings[prop]}
          setting={setting}
          value={values[prop]}
          shapes={labels.shapes}
          locked={locked}
          onChange={(value) => set(prop, value)}
        />
      ))}
      {colours.length > 0 && (
        <div className={CELL}>
          {colours.map(([prop]) => (
            <span key={prop} className="flex min-w-0 items-center gap-1.5">
              <span className={cn(GROUP_LABEL, "truncate")} style={{ color: "var(--ink-soft)" }} aria-hidden="true">
                {labels.settings[prop]}
              </span>
              <Swatch colour={String(values[prop])} label={labels.settings[prop]} locked={locked} onColour={(hex) => set(prop, hex)} />
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** One Paper setting that is not a colour: a slider, a choice, a toggle or a pattern button. */
function SettingCell({
  label,
  setting,
  value,
  shapes,
  locked,
  onChange,
}: {
  label: string;
  setting: PaperSetting;
  value: PaperValue;
  shapes: Record<string, string>;
  locked: boolean;
  onChange: (value: PaperValue) => void;
}) {
  const id = useId();
  switch (setting.kind) {
    case "number":
      return <SliderCell label={label} range={setting.range} value={Number(value)} locked={locked} onChange={onChange} />;
    case "toggle":
      return <ToggleCell label={label} checked={Boolean(value)} locked={locked} onChange={onChange} />;
    case "choice":
      // A single-select, so the underline toggle (DESIGN.md); each option
      // drawn as its shape, which fits half a row where the names would not.
      return (
        <div role="group" aria-labelledby={id} className={CELL}>
          <span id={id} className={cn(GROUP_LABEL, LABEL_BOX)} style={{ color: "var(--ink-soft)" }}>
            {label}
          </span>
          <div className="flex min-w-0 gap-0.5">
            {setting.options.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={value === option}
                aria-label={shapes[option] ?? option}
                title={shapes[option] ?? option}
                onClick={() => onChange(option)}
                disabled={locked}
                className="border-b-2 px-1 py-0.5 transition-colors"
                style={toggleStyle(value === option)}
              >
                <ShapeGlyph shape={option} />
              </button>
            ))}
          </div>
        </div>
      );
    case "pattern":
      return (
        <div className={CELL}>
          <span className={cn(GROUP_LABEL, LABEL_BOX)} style={{ color: "var(--ink-soft)" }} aria-hidden="true">
            {label}
          </span>
          {/* Another pattern on each press: the number itself means nothing to read. */}
          <button
            type="button"
            disabled={locked}
            aria-label={label}
            title={label}
            onClick={() => onChange(nextPattern(setting, Number(value), Math.random()))}
            className="subtle-action flex h-6 w-8 items-center justify-center rounded-[5px]"
          >
            <ShuffleIcon className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      );
    case "colour":
      // Colours sit together in one cell (PaperSettingCells).
      return null;
    default:
      return setting satisfies never;
  }
}

/** The fluted glass's grid shapes, drawn as their flutes. */
const SHAPE_PATHS: Record<string, string> = {
  lines: "M3 2v12M8 2v12M13 2v12",
  linesIrregular: "M2 2v12M5 2v12M10 2v12M12 2v12",
  wave: "M5 1c-2 2.3 2 4.7 0 7s2 4.7 0 7M11 1c-2 2.3 2 4.7 0 7s2 4.7 0 7",
  zigzag: "M5 1 3 4.5 5 8 3 11.5 5 15M11 1 9 4.5 11 8 9 11.5 11 15",
  pattern: "M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5h-4.5zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5h-4.5z",
};

function ShapeGlyph({ shape }: { shape: string }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden="true">
      <path d={SHAPE_PATHS[shape] ?? ""} />
    </svg>
  );
}

/** A labelled checkbox in one cell. */
function ToggleCell({
  label,
  checked,
  locked,
  onChange,
}: {
  label: string;
  checked: boolean;
  locked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={CELL}>
      <span className={cn(GROUP_LABEL, LABEL_BOX)} style={{ color: "var(--ink-soft)" }}>
        {label}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={locked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 accent-[color:var(--emphasis)]"
      />
    </label>
  );
}

/** A colour: the native colour picker over a swatch, as the recipe edit's chips. */
function Swatch({
  colour,
  label,
  locked,
  onColour,
  small = false,
}: {
  colour: string;
  label: string;
  locked: boolean;
  onColour: (hex: string) => void;
  /** Fits inside a label's width, beside its name. */
  small?: boolean;
}) {
  return (
    <label
      className={cn("relative block shrink-0 overflow-hidden rounded-[3px] border", small ? "size-4" : "size-5")}
      style={{ background: colour, borderColor: "var(--border)" }}
      title={label}
    >
      <input
        type="color"
        value={colour.slice(0, 7)}
        onChange={(e) => onColour(e.target.value)}
        disabled={locked}
        aria-label={label}
        className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
      />
    </label>
  );
}
