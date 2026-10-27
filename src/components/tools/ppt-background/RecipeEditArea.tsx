"use client";

import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecipeControls, RecipeEdit } from "@/lib/gallery/recipeEdit";

export interface RecipeEditLabels {
  /** The area's toggle. */
  heading: string;
  /** The colour-family (hue) slider. */
  hue: string;
  /** Back to the gallery item as it is. */
  reset: string;
  /** Shown in place of the area where WebGL2 is missing. */
  unavailable: string;
}

/** The recipe edit on the crop screen of a Paper gallery item (CONTEXT "Recipe edit"). */
export interface RecipeEditProps {
  /** This browser can draw the recipe (WebGL2); otherwise only a note shows. */
  available: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  controls: RecipeControls;
  edit: RecipeEdit;
  onEdit: (edit: RecipeEdit) => void;
  /** The edit differs from the recipe: 원래대로 has something to undo. */
  edited: boolean;
  onReset: () => void;
  /** A run uses the pick: shown as is, nothing responds. */
  locked: boolean;
  labels: RecipeEditLabels;
}

const GROUP_LABEL = "font-mono text-[10px] font-medium uppercase tracking-[0.08em]";

export function RecipeEditArea({
  available,
  open,
  onOpenChange,
  controls,
  edit,
  onEdit,
  edited,
  onReset,
  locked,
  labels,
}: RecipeEditProps) {
  if (!available) {
    return (
      <p className="font-body text-[10.5px] leading-[1.35]" style={{ color: "var(--ink-soft)" }}>
        {labels.unavailable}
      </p>
    );
  }
  const { hue } = controls;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          className="flex items-center gap-1 py-0.5 font-body text-[11.5px] font-medium"
          style={{ color: "var(--ink-strong)" }}
        >
          <ChevronDownIcon
            className={cn("size-3.5 transition-transform", !open && "-rotate-90")}
            style={{ color: "var(--ink-soft)" }}
            aria-hidden="true"
          />
          {labels.heading}
        </button>
        {open && (
          <button
            type="button"
            onClick={onReset}
            disabled={locked || !edited}
            className="subtle-action rounded-[5px] px-2.5 py-1.5 font-body text-[11px]"
          >
            {labels.reset}
          </button>
        )}
      </div>
      {open && (
        <label className="flex items-center gap-2.5">
          <span className={cn(GROUP_LABEL, "shrink-0")} style={{ color: "var(--ink-soft)" }}>
            {labels.hue}
          </span>
          <input
            type="range"
            min={hue.min}
            max={hue.max}
            step={hue.step}
            value={edit.hueShift}
            disabled={locked}
            onChange={(e) => onEdit({ ...edit, hueShift: Number(e.target.value) })}
            className="min-w-0 flex-1 accent-[color:var(--emphasis)]"
          />
          <span className="w-9 shrink-0 text-right font-body text-[11px] tabular-nums" style={{ color: "var(--ink-strong)" }}>
            {`${edit.hueShift > 0 ? "+" : ""}${edit.hueShift}°`}
          </span>
        </label>
      )}
    </div>
  );
}
