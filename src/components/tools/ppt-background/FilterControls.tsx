"use client";

import type { FilterSet, OfferedFilters } from "@/lib/image/filterSet";
import { SliderCell } from "./SliderCell";

/** [임시] copy (효과 / 흐리게 / 어둡게·밝게 / 입자 / 효과 끄기) until the spec-end visual QA. */
export interface FilterLabels {
  /** The filter set's group in the edit area. */
  effects: string;
  /** The blur slider. */
  blur: string;
  /** The light or dark veil slider. */
  veil: string;
  /** The grain slider. */
  grain: string;
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

/** The sliders, in the order the plan lays their filters. */
const SLIDERS = ["blur", "veil", "grain"] as const;

export function FilterControls({ offered, filters, onChange, locked, labels }: FilterControlsProps) {
  return (
    // Two controls a row, as the recipe edit's.
    <div className="grid gap-x-3 gap-y-1.5" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
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
