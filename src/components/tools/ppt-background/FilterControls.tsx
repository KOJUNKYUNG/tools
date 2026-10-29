"use client";

import { cn } from "@/lib/utils";
import type { FilterSet, OfferedFilters } from "@/lib/image/filterSet";
import type { PaperFilter } from "@/lib/image/paperFilters";
import { GROUP_LABEL, LABEL_BOX, SliderCell } from "./SliderCell";

/**
 * [임시] copy (효과 / 흐리게 / 어둡게·밝게 / 입자 / 스타일 / 없음 / 유리 / 종이 /
 * 망점 / 모자이크 / CMYK / 강도 / 효과 끄기) until the spec-end visual QA.
 * `common.errors.filterDrawFailed` names the style and "none" labels: it
 * changes with them.
 */
export interface FilterLabels {
  /** The filter set's group in the edit area. */
  effects: string;
  /** The blur slider. */
  blur: string;
  /** The light or dark veil slider. */
  veil: string;
  /** The grain slider. */
  grain: string;
  /** The one-of choice of Paper filter. */
  paper: string;
  /** The choice of no Paper filter. */
  paperNone: string;
  /** Each Paper filter's name. */
  paperFilters: Record<PaperFilter, string>;
  /** The Paper filter's strength slider. */
  strength: string;
  /** Clears every filter. */
  reset: string;
}

/** The filter set's controls, the "effects" group of a picture's edit area (CONTEXT "Filter set"). */
export interface FilterControlsProps {
  offered: OfferedFilters;
  filters: FilterSet;
  onChange: (change: Partial<FilterSet>) => void;
  /** A run uses the pick: shown as is, nothing responds. */
  locked: boolean;
  labels: FilterLabels;
}

/** The sliders after the Paper filter, in the order the plan lays their filters. */
const SLIDERS = ["blur", "veil", "grain"] as const;

export function FilterControls({ offered, filters, onChange, locked, labels }: FilterControlsProps) {
  const paperOffer = offered.paper;
  return (
    // Two controls a row, as the recipe edit's; the Paper filter first, as the plan lays it.
    <div className="grid gap-x-3 gap-y-1.5" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
      {paperOffer && (
        <>
          {/* A single-select, so the selected-toggle underline (DESIGN.md), across the row;
              too narrow for every name (a phone, longer copy), it wraps rather than cut one. */}
          <div role="group" aria-label={labels.paper} className="col-span-2 flex min-h-6 min-w-0 items-center gap-1.5">
            <span className={cn(GROUP_LABEL, LABEL_BOX)} style={{ color: "var(--ink-soft)" }} aria-hidden="true">
              {labels.paper}
            </span>
            <div className="flex min-w-0 flex-wrap gap-0.5">
              {[null, ...paperOffer.filters].map((filter) => {
                const chosen = filters.paper === filter;
                return (
                  <button
                    key={filter ?? "none"}
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => onChange({ paper: filter })}
                    disabled={locked}
                    className="truncate border-b-2 px-1.5 py-0.5 font-body text-[11px] font-medium transition-colors"
                    style={{
                      color: chosen ? "var(--ink-strong)" : "var(--ink-soft)",
                      borderBottomColor: chosen ? "var(--emphasis)" : "transparent",
                    }}
                  >
                    {filter ? labels.paperFilters[filter] : labels.paperNone}
                  </button>
                );
              })}
            </div>
          </div>
          <SliderCell
            label={labels.strength}
            range={paperOffer.strength}
            value={filters.paperStrength}
            // The strength of no filter does nothing.
            locked={locked || !filters.paper}
            onChange={(value) => onChange({ paperStrength: value })}
          />
        </>
      )}
      {SLIDERS.map((filter) => {
        const range = offered[filter];
        return (
          range && (
            <SliderCell
              key={filter}
              label={labels[filter]}
              range={range}
              value={filters[filter]}
              locked={locked}
              onChange={(value) => onChange({ [filter]: value })}
            />
          )
        );
      })}
    </div>
  );
}
