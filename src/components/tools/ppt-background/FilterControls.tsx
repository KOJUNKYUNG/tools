"use client";

import type { FilterSet, OfferedFilters } from "@/lib/image/filterSet";
import { SliderCell } from "./SliderCell";

export interface FilterLabels {
  /** The filter set's group in the edit area. */
  effects: string;
  /** The light or dark veil slider. */
  veil: string;
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

export function FilterControls({ offered, filters, onChange, locked, labels }: FilterControlsProps) {
  return (
    // Two controls a row, as the recipe edit's.
    <div className="grid gap-x-3 gap-y-1.5" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
      {offered.veil && (
        <SliderCell
          label={labels.veil}
          range={offered.veil}
          value={filters.veil}
          locked={locked}
          onChange={(veil) => onChange({ veil })}
        />
      )}
    </div>
  );
}
