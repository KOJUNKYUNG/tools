"use client";
import { NumberField } from "@/components/common/NumberField";
import { clampBox, MAX_PLACEMENT_SHARE, MIN_PLACEMENT_SHARE, type Box } from "@/lib/pptx/slidePlacement";

interface Props {
  box: Box;
  onBoxChange: (b: Box) => void;
  slideW: number; // inches
  slideH: number; // inches
  /** The reference image's fit-to-slide placement (inches). Null until first image loads. */
  refSize: { w: number; h: number } | null;
  labels: {
    posX: string;
    posY: string;
    sizeW: string;
    sizeH: string;
    centerH: string;
    centerV: string;
  };
}

type FieldKey = keyof Box;
type FieldLabel = "posX" | "posY" | "sizeW" | "sizeH";

// Size runs 10–300% of the fill size; a position goes negative as far as a
// 300% box reaches past the slide. The clamp then applies the full rule.
const RANGE: Record<FieldKey, [number, number]> = {
  w: [MIN_PLACEMENT_SHARE * 100, MAX_PLACEMENT_SHARE * 100],
  h: [MIN_PLACEMENT_SHARE * 100, MAX_PLACEMENT_SHARE * 100],
  x: [(1 - MAX_PLACEMENT_SHARE) * 100, 100],
  y: [(1 - MAX_PLACEMENT_SHARE) * 100, 100],
};

// DESIGN.md "Input / number fields": --surface-2 fill, --border edge, 3 px corners.
const INPUT =
  "h-7 w-[58px] rounded-[3px] border px-1.5 text-right font-body text-[12px] tabular-nums outline-none focus:border-transparent focus:outline-2 focus:outline-[color:var(--emphasis)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const INPUT_STYLE = {
  background: "var(--surface-2)",
  borderColor: "var(--border)",
  color: "var(--ink-strong)",
} as const;
const ACTION = "subtle-action rounded-[5px] px-2.5 py-1.5 font-body text-[11px] whitespace-nowrap";

/**
 * The placement fields under the preview, in two rows that never change
 * shape: size (width, height), then position (X, Y) with the centre buttons.
 */
export function PlacementControls({ box, onBoxChange, slideW, slideH, refSize, labels }: Props) {
  // Guard against degenerate refSize (computeSlidePlacement returns {w:0,h:0} for degenerate inputs)
  const validRef = refSize && refSize.w > 0 && refSize.h > 0 ? refSize : null;

  // Display values as percentages. NumberField owns the mid-edit text and syncs
  // from this value when the field is not focused, so no local draft is needed.
  function toDisplay(key: FieldKey): number {
    if (key === "x") return Math.round((box.x / slideW) * 100);
    if (key === "y") return Math.round((box.y / slideH) * 100);
    if (key === "w") return validRef ? Math.round((box.w / validRef.w) * 100) : Math.round((box.w / slideW) * 100);
    /* h */ return validRef ? Math.round((box.h / validRef.h) * 100) : Math.round((box.h / slideH) * 100);
  }

  const commit = (key: FieldKey, pct: number) => {
    let inches: number;
    if (key === "x") inches = (pct / 100) * slideW;
    else if (key === "y") inches = (pct / 100) * slideH;
    else if (key === "w") inches = validRef ? (pct / 100) * validRef.w : (pct / 100) * slideW;
    else /* h */ inches = validRef ? (pct / 100) * validRef.h : (pct / 100) * slideH;
    onBoxChange(clampBox({ ...box, [key]: inches }, slideW, slideH, validRef));
  };

  const field = (key: FieldKey, lab: FieldLabel) => (
    <label className="flex items-center gap-1.5 whitespace-nowrap font-body text-[12px]" style={{ color: "var(--ink)" }}>
      <span>{labels[lab]}</span>
      <NumberField
        value={toDisplay(key)}
        onCommit={(pct) => commit(key, pct)}
        min={RANGE[key][0]}
        max={RANGE[key][1]}
        fallback={0}
        ariaLabel={labels[lab]}
        className={INPUT}
        style={INPUT_STYLE}
      />
      <span style={{ color: "var(--ink-soft)" }}>%</span>
    </label>
  );

  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div className="flex items-center gap-3">
        {field("w", "sizeW")}
        {field("h", "sizeH")}
      </div>
      <div className="flex items-center gap-3">
        {field("x", "posX")}
        {field("y", "posY")}
        <span className="flex-1" />
        <button type="button" onClick={() => onBoxChange({ ...box, x: (slideW - box.w) / 2 })} className={ACTION}>
          {labels.centerH}
        </button>
        <button type="button" onClick={() => onBoxChange({ ...box, y: (slideH - box.h) / 2 })} className={ACTION}>
          {labels.centerV}
        </button>
      </div>
    </div>
  );
}
