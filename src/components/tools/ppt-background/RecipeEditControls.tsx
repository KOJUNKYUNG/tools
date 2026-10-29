"use client";

import { useRef } from "react";
import { flushSync } from "react-dom";
import { PlusIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { template } from "@/lib/common/template";
import {
  SLIDERS,
  type ColourChip,
  type RecipeControls,
  type RecipeEdit,
  type Slider,
  type SliderLabel,
} from "@/lib/gallery/recipeEdit";
import { GROUP_LABEL, LABEL_BOX, SliderCell } from "./SliderCell";

export interface RecipeEditLabels {
  /** The edit area's toggle. */
  heading: string;
  /** The recipe edit's group in the edit area. */
  shape: string;
  /** The colour-family (hue) slider. */
  hue: string;
  /** The size slider: the recipe's `scale`. */
  size: string;
  /** The grain slider, where the shader has grain: along colour edges. */
  grain: string;
  /** The softness slider, where the shader has softness. */
  softness: string;
  /** The shape slider's names, one per value it moves. */
  frame: string;
  colourSpots: string;
  rays: string;
  waveHeight: string;
  density: string;
  twist: string;
  thickness: string;
  irregularity: string;
  coverage: string;
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

/** The recipe edit's controls, the "shape" group of a Paper gallery item's edit area (CONTEXT "Recipe edit"). */
export interface RecipeEditControlsProps {
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
  /** A run uses the pick: shown as is, nothing responds. */
  locked: boolean;
  labels: RecipeEditLabels;
}

export function RecipeEditControls({
  controls,
  edit,
  onHueShift,
  onSlider,
  chips,
  canAddColour,
  onColour,
  onAddColour,
  onRemoveColour,
  locked,
  labels,
}: RecipeEditControlsProps) {
  const chipRow = useRef<HTMLDivElement>(null);
  return (
    // Two controls a row: the colour family and the size, the colours under
    // the colour family, then the rest.
    <div className="grid gap-x-3 gap-y-1.5" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
      <SliderCell
        label={labels.hue}
        range={controls.hue}
        value={edit.hueShift}
        locked={locked}
        onChange={onHueShift}
      />

      {controls.size && (
        <SliderCell
          label={labels.size}
          range={controls.size}
          value={edit.size}
          locked={locked}
          onChange={(value) => onSlider("size", value)}
        />
      )}

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

      {SLIDERS.filter((slider) => slider !== "size").map((slider) => {
        const range = controls[slider];
        // Hidden where the shader lacks the value: it would change nothing.
        if (!range) return null;
        return (
          <SliderCell
            key={slider}
            // Every shape range names itself, so the bare "shape" key never comes up.
            label={labels[(range.label ?? slider) as Exclude<Slider, "shape"> | SliderLabel]}
            range={range}
            value={edit[slider]}
            locked={locked}
            onChange={(value) => onSlider(slider, value)}
          />
        );
      })}
    </div>
  );
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
