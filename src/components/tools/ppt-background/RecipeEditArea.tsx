"use client";

import { useId, useRef } from "react";
import { flushSync } from "react-dom";
import { ChevronDownIcon, PlusIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { template } from "@/lib/common/template";
import { NumberField } from "@/components/common/NumberField";
import {
  SLIDERS,
  type ColourChip,
  type RecipeControls,
  type RecipeEdit,
  type Slider,
  type SliderLabel,
  type SliderRange,
} from "@/lib/gallery/recipeEdit";

export interface RecipeEditLabels {
  /** The area's toggle. */
  heading: string;
  /** The colour-family (hue) slider. */
  hue: string;
  /** The size slider: the recipe's `scale`. */
  size: string;
  /** The grain slider, where the shader has grain. */
  grain: string;
  /** A mesh gradient's grain on colour edges, beside its grain dots. */
  grainEdge: string;
  /** A mesh gradient's grain dots over the picture. */
  grainOverlay: string;
  /** The softness slider, where the shader has softness. */
  softness: string;
  /** The shape slider's names, one per value it moves (`shape` where none is given). */
  shape: string;
  flow: string;
  arrangement: string;
  rays: string;
  spread: string;
  waveHeight: string;
  density: string;
  twist: string;
  thickness: string;
  irregularity: string;
  lightShare: string;
  pixelSize: string;
  dotSize: string;
  /** The row of colour chips. */
  colours: string;
  /** A chip's name, `{n}` its place in the row. */
  colourTemplate: string;
  /** Adds a colour to the list. */
  addColour: string;
  /** Removes an added colour, `{n}` its place in the row. */
  removeTemplate: string;
  /** Back to the gallery item as it is. */
  reset: string;
  /** Shown in place of the area where WebGL2 is missing. */
  unavailable: string;
  /** The spinner on the pictures while the preview catches up with the edit. */
  drawing: string;
}

/** The recipe edit on the crop screen of a Paper gallery item (CONTEXT "Recipe edit"). */
export interface RecipeEditProps {
  /** This browser can draw the recipe (WebGL2); otherwise only a note shows. */
  available: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  controls: RecipeControls;
  edit: RecipeEdit;
  onHueShift: (degrees: number) => void;
  /** A size, grain, softness or shape slider moved to `value` (in its edit value's unit). */
  onSlider: (slider: Slider, value: number) => void;
  /** Every colour of the recipe and the added ones, as drawn. */
  chips: ColourChip[];
  /** "+" is offered: the colour list is below its maximum. */
  canAddColour: boolean;
  /** Chip `id` set to `hex` (`#rrggbb`). */
  onColour: (id: string, hex: string) => void;
  /** Append a colour (the one removed last, or a copy of the last one); its picker opens. */
  onAddColour: () => void;
  onRemoveColour: (id: string) => void;
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
  onHueShift,
  onSlider,
  chips,
  canAddColour,
  onColour,
  onAddColour,
  onRemoveColour,
  edited,
  onReset,
  locked,
  labels,
}: RecipeEditProps) {
  const chipRow = useRef<HTMLDivElement>(null);
  if (!available) {
    return (
      <p className="font-body text-[10.5px] leading-[1.35]" style={{ color: "var(--ink-soft)" }}>
        {labels.unavailable}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-6 items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          // Locked with the rest of the left pane while a run uses the pick.
          disabled={locked}
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
            className="subtle-action rounded-[5px] px-2.5 py-1 font-body text-[11px]"
          >
            {labels.reset}
          </button>
        )}
      </div>
      {open && (
        // Two controls a row, the colour family and the colours first.
        <div className="grid gap-x-3 gap-y-1.5" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <SliderCell
            label={labels.hue}
            range={controls.hue}
            value={edit.hueShift}
            locked={locked}
            onChange={onHueShift}
          />

          <div className="flex h-6 min-w-0 items-center gap-1.5">
            <span className={cn(GROUP_LABEL, LABEL_BOX)} style={{ color: "var(--ink-soft)" }}>
              {labels.colours}
            </span>
            {/* One row at every width: chips shrink before they wrap. */}
            <div ref={chipRow} className="flex min-w-0 flex-1 items-center gap-1.5">
              {chips.map((chip, i) => (
                <Chip
                  key={chip.id}
                  chip={chip}
                  name={template(labels.colourTemplate, { n: i + 1 })}
                  removeLabel={template(labels.removeTemplate, { n: i + 1 })}
                  locked={locked}
                  onColour={(hex) => onColour(chip.id, hex)}
                  onRemove={() => onRemoveColour(chip.id)}
                />
              ))}
              {canAddColour && (
                <button
                  type="button"
                  disabled={locked}
                  aria-label={labels.addColour}
                  title={labels.addColour}
                  onClick={() => {
                    // The added chip renders now, so its picker opens within this click.
                    flushSync(onAddColour);
                    const inputs = chipRow.current?.querySelectorAll<HTMLInputElement>('input[type="color"]');
                    openPicker(inputs?.[inputs.length - 1]);
                  }}
                  className="subtle-action flex h-5 w-5 min-w-2.5 shrink items-center justify-center rounded-[3px] border border-dashed"
                >
                  <PlusIcon className="size-3" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {SLIDERS.map((slider) => {
            const range = controls[slider];
            // Hidden where the shader lacks the value: it would change nothing.
            if (!range) return null;
            return (
              <SliderCell
                key={slider}
                label={labels[(range.label ?? slider) satisfies Slider | SliderLabel]}
                range={range}
                value={edit[slider]}
                locked={locked}
                onChange={(value) => onSlider(slider, value)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Every label of the area takes the same width, so each control starts at the same place. */
const LABEL_BOX = "line-clamp-2 w-16 shrink-0 break-keep leading-[1.15]";

/** A labelled slider with a number field for its value, in one cell of the area's grid. */
function SliderCell({
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
  const { shown } = range;
  // Read to a tenth, or a hundredth of a second: as fine as the finest steps.
  const toShown = (v: number) => Number((v * shown.times).toFixed(shown.times < 1 ? 2 : 1));
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
          value={toShown(value)}
          // Typed values land on the slider's step, as a dragged one does.
          onCommit={(typed) => onChange(onStep(typed / shown.times, range))}
          min={toShown(range.min)}
          max={toShown(range.max)}
          fallback={toShown(value)}
          disabled={locked}
          ariaLabel={label}
          className="h-6 w-[3.25rem] rounded-[5px] border px-1 text-right font-body text-[11px] tabular-nums"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--ink-strong)" }}
        />
        <span className="w-2 font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
          {shown.suffix}
        </span>
      </span>
    </div>
  );
}

/** `value` on the nearest step of `range`, inside it. */
function onStep(value: number, { min, max, step }: SliderRange): number {
  const stepped = min + Math.round((value - min) / step) * step;
  // Rounded off the float error of adding steps (0.1 + 0.2).
  return Math.min(max, Math.max(min, Number(stepped.toFixed(6))));
}

/** Open a colour input's picker over its chip, where the browser lets a script do so. */
function openPicker(input: HTMLInputElement | undefined) {
  if (!input) return;
  // Lay the chip out first: the picker opens where the input is, and a chip
  // just added has no place yet (the picker would open at the window's corner).
  input.getBoundingClientRect();
  try {
    input.showPicker();
  } catch {
    input.click();
  }
}

/** One colour of the recipe: the native colour picker over a swatch, and × on an added colour. */
function Chip({
  chip,
  name,
  removeLabel,
  locked,
  onColour,
  onRemove,
}: {
  chip: ColourChip;
  name: string;
  removeLabel: string;
  locked: boolean;
  onColour: (hex: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="relative h-5 w-5 min-w-2.5 shrink">
      <label
        className="block size-full overflow-hidden rounded-[3px] border"
        style={{ background: chip.colour, borderColor: "var(--border)" }}
        title={name}
      >
        <input
          type="color"
          // The picker has no alpha: it shows the colour without the chip's transparency.
          value={chip.colour.slice(0, 7)}
          onChange={(e) => onColour(e.target.value)}
          disabled={locked}
          aria-label={name}
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
        />
      </label>
      {chip.added && (
        // On the swatch: a fixed white chip with dark ink, read over any colour.
        <button
          type="button"
          onClick={onRemove}
          disabled={locked}
          aria-label={removeLabel}
          title={removeLabel}
          className="absolute -right-1.5 -top-1.5 flex size-3.5 items-center justify-center rounded-full border disabled:opacity-50"
          style={{ background: "var(--mono-0)", borderColor: "var(--mono-200)", color: "var(--mono-1000)" }}
        >
          <XIcon className="size-2.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
