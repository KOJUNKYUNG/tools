"use client";
import { NumberField } from "@/components/common/NumberField";
import { clampBox, type Box } from "@/lib/pptx/slidePlacement";

interface Props {
  box: Box;
  onBoxChange: (b: Box) => void;
  slideW: number; // inches
  slideH: number; // inches
  /** The reference image's fit-to-slide placement (inches). Null until first image loads. */
  refSize: { w: number; h: number } | null;
  labels: {
    placeLabel: string;
    posX: string;
    posY: string;
    sizeW: string;
    sizeH: string;
    centerH: string;
    centerV: string;
  };
}

type FieldKey = keyof Box;

const FIELDS: { key: FieldKey; lab: "posX" | "posY" | "sizeW" | "sizeH" }[] = [
  { key: "x", lab: "posX" }, { key: "y", lab: "posY" },
  { key: "w", lab: "sizeW" }, { key: "h", lab: "sizeH" },
];

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
    onBoxChange(clampBox({ ...box, [key]: inches }, slideW, slideH));
  };

  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px]" style={{ color: "var(--ink-soft)" }}>{labels.placeLabel}</p>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-1.5 text-[12px]">
            <span style={{ color: "var(--ink-soft)" }} className="w-9 shrink-0">{labels[f.lab]}</span>
            <NumberField
              value={toDisplay(f.key)}
              onCommit={(pct) => commit(f.key, pct)}
              min={0}
              max={100}
              fallback={0}
              ariaLabel={labels[f.lab]}
              className="nameplate h-8 w-full min-w-0 rounded-[9px] px-1.5 text-right text-[12px] tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onBoxChange({ ...box, x: (slideW - box.w) / 2 })}
          className="flex-1 rounded-[5px] border px-2.5 py-1.5 font-body text-[11px] transition-colors hover:border-[color:var(--emphasis)]"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--ink-strong)" }}
        >
          {labels.centerH}
        </button>
        <button
          type="button"
          onClick={() => onBoxChange({ ...box, y: (slideH - box.h) / 2 })}
          className="flex-1 rounded-[5px] border px-2.5 py-1.5 font-body text-[11px] transition-colors hover:border-[color:var(--emphasis)]"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--ink-strong)" }}
        >
          {labels.centerV}
        </button>
      </div>
    </div>
  );
}
