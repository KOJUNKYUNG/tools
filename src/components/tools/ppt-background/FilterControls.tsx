"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import type { FilterSet, OfferedFilters } from "@/lib/image/filterSet";
import type { PaperFilter } from "@/lib/image/paperFilters";
import { GROUP_LABEL, LABEL_BOX, SliderCell } from "./SliderCell";

/**
 * [임시] copy (효과 / 흐리게 / 어둡게·밝게 / 입자 / 스타일 / 없음 / 줄무늬 유리 /
 * 강도 / 효과 끄기) until the spec-end visual QA.
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

/** The value of the "none" choice. */
const NONE = "";

export function FilterControls({ offered, filters, onChange, locked, labels }: FilterControlsProps) {
  const choiceId = useId();
  const { paper } = offered;
  return (
    // Two controls a row, as the recipe edit's; the Paper filter first, as the plan lays it.
    <div className="grid gap-x-3 gap-y-1.5" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
      {paper && (
        <>
          <div className="flex h-6 min-w-0 items-center gap-1.5">
            <label htmlFor={choiceId} className={cn(GROUP_LABEL, LABEL_BOX)} style={{ color: "var(--ink-soft)" }}>
              {labels.paper}
            </label>
            <select
              id={choiceId}
              value={filters.paper ?? NONE}
              disabled={locked}
              onChange={(e) => onChange({ paper: e.target.value === NONE ? null : (e.target.value as PaperFilter) })}
              className="h-6 min-w-0 flex-1 rounded-[5px] border px-1 font-body text-[11px]"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--ink-strong)" }}
            >
              <option value={NONE}>{labels.paperNone}</option>
              {paper.filters.map((filter) => (
                <option key={filter} value={filter}>
                  {labels.paperFilters[filter]}
                </option>
              ))}
            </select>
          </div>
          <SliderCell
            label={labels.strength}
            range={paper.strength}
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
