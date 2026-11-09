"use client";
import { NumberField } from "@/components/common/NumberField";
import {
  centerBox,
  lockBox,
  MAX_PLACEMENT_SHARE,
  MIN_PLACEMENT_SHARE,
  placementPercents,
  setPlacementField,
  type Box,
  type FillSize,
  type PlacementField,
  type PlacementPercents,
} from "@/lib/pptx/slidePlacement";

/** What the preview draws for the focused field: a position's distance, or the 100% size. */
export type PlacementGuide = "x" | "y" | "size" | null;

interface Props {
  box: Box;
  onBoxChange: (b: Box) => void;
  slideW: number; // inches
  slideH: number; // inches
  /** The fill size (inches): the first picture as large as fits the slide; null until it loads. */
  fill: FillSize | null;
  /** Width and height locked to the first picture's shape. */
  lock: boolean;
  onLockChange: (lock: boolean) => void;
  /** Which guide the focused field asks the preview for; null when none is focused. */
  onGuideChange: (guide: PlacementGuide) => void;
  labels: {
    fromLeft: string;
    fromTop: string;
    size: string;
    sizeW: string;
    sizeH: string;
    sizeLock: string;
    sizeHint: string;
    centerH: string;
    centerV: string;
  };
}

// Size runs 10–300% of the fill size; a position goes negative as far as a
// 300% box reaches past the slide. The placement rule then applies in full.
const SIZE = { min: MIN_PLACEMENT_SHARE * 100, max: MAX_PLACEMENT_SHARE * 100, fallback: 100 };
const POSITION = { min: (1 - MAX_PLACEMENT_SHARE) * 100, max: 100, fallback: 0 };

/** Per field: its value in the placement percents, its range, and the guide it draws when focused. */
const FIELDS: Record<PlacementField, { reads: keyof PlacementPercents; range: typeof SIZE; guide: PlacementGuide }> = {
  size: { reads: "w", range: SIZE, guide: "size" },
  w: { reads: "w", range: SIZE, guide: "size" },
  h: { reads: "h", range: SIZE, guide: "size" },
  x: { reads: "x", range: POSITION, guide: "x" },
  y: { reads: "y", range: POSITION, guide: "y" },
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
 * shape: the size (one field, or width and height unlocked, in one slot), the
 * lock and the 100% hint; then the position from the slide's left and top
 * with the centre buttons.
 */
export function PlacementControls({ box, onBoxChange, slideW, slideH, fill, lock, onLockChange, onGuideChange, labels }: Props) {
  const pct = placementPercents(box, slideW, slideH, fill);
  const frame = { slideW, slideH, fill, lock };

  // NumberField owns the mid-edit text and syncs from this value when the
  // field is not focused, so no local draft is needed.
  const field = (key: PlacementField, label: string) => {
    const { reads, range, guide } = FIELDS[key];
    return (
      <label
        className="flex items-center gap-1.5 whitespace-nowrap font-body text-[12px]"
        style={{ color: "var(--ink)" }}
        onFocus={() => onGuideChange(guide)}
        onBlur={() => onGuideChange(null)}
      >
        <span>{label}</span>
        <NumberField
          value={Math.round(pct[reads])}
          onCommit={(v) => onBoxChange(setPlacementField(box, key, v, frame))}
          min={range.min}
          max={range.max}
          fallback={range.fallback}
          ariaLabel={label}
          className={INPUT}
          style={INPUT_STYLE}
        />
        <span style={{ color: "var(--ink-soft)" }}>%</span>
      </label>
    );
  };

  const toggleLock = (next: boolean) => {
    if (next) onBoxChange(lockBox(box, slideW, slideH, fill));
    onLockChange(next);
  };

  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div className="flex items-center gap-3">
        {/* One slot for both forms, as wide as the wider (unlocked) one, so the
            lock beside it never moves. The hidden form keeps its room only. */}
        <div className="grid">
          <div className={`col-start-1 row-start-1 flex items-center gap-3 ${lock ? "" : "invisible"}`} aria-hidden={!lock}>
            {field("size", labels.size)}
          </div>
          <div className={`col-start-1 row-start-1 flex items-center gap-3 ${lock ? "invisible" : ""}`} aria-hidden={lock}>
            {field("w", labels.sizeW)}
            {field("h", labels.sizeH)}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap font-body text-[12px]" style={{ color: "var(--ink)" }}>
          <input
            type="checkbox"
            checked={lock}
            onChange={(e) => toggleLock(e.target.checked)}
            className="size-3.5 accent-[color:var(--emphasis)]"
          />
          {labels.sizeLock}
        </label>
        <span className="min-w-0 truncate font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
          {labels.sizeHint}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {field("x", labels.fromLeft)}
        {field("y", labels.fromTop)}
        <span className="flex-1" />
        <button type="button" onClick={() => onBoxChange(centerBox(box, "x", slideW, slideH))} className={ACTION}>
          {labels.centerH}
        </button>
        <button type="button" onClick={() => onBoxChange(centerBox(box, "y", slideW, slideH))} className={ACTION}>
          {labels.centerV}
        </button>
      </div>
    </div>
  );
}
