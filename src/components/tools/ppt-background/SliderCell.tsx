"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { NumberField } from "@/components/common/NumberField";
import { shownValue, typedValue, type SliderRange } from "@/lib/gallery/recipeEdit";

/** A control's label in the edit area. */
export const GROUP_LABEL = "font-mono text-[10px] font-medium uppercase tracking-[0.08em]";

/** Every label of the area takes the same width, so each control starts at the same place. */
export const LABEL_BOX = "line-clamp-2 w-16 shrink-0 break-keep leading-[1.15]";

/** A labelled slider with a number field for its value, in one cell of the area's grid. */
export function SliderCell({
  label,
  range,
  value,
  locked,
  onChange,
}: {
  label: string;
  range: SliderRange;
  value: number;
  locked: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const shownNow = shownValue(range, value);
  return (
    <div className="flex h-6 min-w-0 items-center gap-1.5">
      <label htmlFor={id} className={cn(GROUP_LABEL, LABEL_BOX)} style={{ color: "var(--ink-soft)" }}>
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        disabled={locked}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 accent-[color:var(--emphasis)]"
      />
      <span className="flex shrink-0 items-center gap-0.5">
        <NumberField
          value={shownNow}
          // A typed value lands on the slider's step, and the field reads it so (50.2 reads 50).
          normalize={(typed) => shownValue(range, typedValue(range, typed))}
          onCommit={(typed) => {
            // Leaving the field untouched is no edit.
            if (typed !== shownNow) onChange(typedValue(range, typed));
          }}
          min={shownValue(range, range.min)}
          max={shownValue(range, range.max)}
          step={arrowStep(range)}
          fallback={shownNow}
          disabled={locked}
          ariaLabel={label}
          inputMode={Number.isInteger(range.step * range.shown.times) ? "numeric" : "decimal"}
          className="h-6 w-14 rounded-[5px] border px-1 text-right font-body text-[11px] tabular-nums"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--ink-strong)" }}
        />
        <span className="w-2 font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
          {range.shown.suffix}
        </span>
      </span>
    </div>
  );
}

/**
 * How far one arrow step of the number field moves, as read: one whole unit,
 * or the slider's step where that is coarser (5%), on the grid the browser
 * steps on (from the range's minimum); where a whole unit is off that grid
 * (dithering's pixel size from 0.5), the slider's own step.
 */
function arrowStep(range: SliderRange): number {
  const step = range.step * range.shown.times;
  const whole = Math.max(1, step);
  const min = shownValue(range, range.min);
  return Math.abs(min / whole - Math.round(min / whole)) < 1e-9 ? whole : step;
}
