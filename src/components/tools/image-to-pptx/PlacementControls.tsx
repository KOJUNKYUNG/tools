"use client";
import { useEffect, useState } from "react";
import type { Box } from "@/lib/pptx/slidePlacement";

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

const MIN_IN = 0.1;
function clampBox(b: Box, slideW: number, slideH: number): Box {
  const w = Math.max(MIN_IN, Math.min(slideW, b.w));
  const h = Math.max(MIN_IN, Math.min(slideH, b.h));
  const x = Math.max(0, Math.min(b.x, slideW - w));
  const y = Math.max(0, Math.min(b.y, slideH - h));
  return { x, y, w, h };
}

type FieldKey = keyof Box;

const FIELDS: { key: FieldKey; lab: "posX" | "posY" | "sizeW" | "sizeH" }[] = [
  { key: "x", lab: "posX" }, { key: "y", lab: "posY" },
  { key: "w", lab: "sizeW" }, { key: "h", lab: "sizeH" },
];

export function PlacementControls({ box, onBoxChange, slideW, slideH, refSize, labels }: Props) {
  const [draft, setDraft] = useState<Record<FieldKey, string>>({ x: "", y: "", w: "", h: "" });
  const [editing, setEditing] = useState<FieldKey | null>(null);

  // Display values as percentages
  function toDisplay(key: FieldKey): number {
    if (key === "x") return Math.round((box.x / slideW) * 100);
    if (key === "y") return Math.round((box.y / slideH) * 100);
    if (key === "w") return refSize ? Math.round((box.w / refSize.w) * 100) : Math.round((box.w / slideW) * 100);
    /* h */ return refSize ? Math.round((box.h / refSize.h) * 100) : Math.round((box.h / slideH) * 100);
  }

  useEffect(() => {
    if (editing) return;
    setDraft({
      x: String(toDisplay("x")),
      y: String(toDisplay("y")),
      w: String(toDisplay("w")),
      h: String(toDisplay("h")),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, editing, slideW, slideH, refSize]);

  const commit = (key: FieldKey, raw: string) => {
    const pct = Math.max(0, Math.min(100, Number(raw) || 0));
    let inches: number;
    if (key === "x") inches = (pct / 100) * slideW;
    else if (key === "y") inches = (pct / 100) * slideH;
    else if (key === "w") inches = refSize ? (pct / 100) * refSize.w : (pct / 100) * slideW;
    else /* h */ inches = refSize ? (pct / 100) * refSize.h : (pct / 100) * slideH;
    const updated = clampBox({ ...box, [key]: inches }, slideW, slideH);
    onBoxChange(updated);
    setEditing(null);
  };

  return (
    <div className="space-y-2">
      <p className="font-display text-[11px]" style={{ color: "var(--ink-soft)" }}>{labels.placeLabel}</p>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-1.5 text-[12px]">
            <span style={{ color: "var(--ink-soft)" }} className="w-10">{labels[f.lab]}</span>
            <input type="number" min={0} max={100} value={draft[f.key]}
              onFocus={() => setEditing(f.key)}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              onBlur={(e) => commit(f.key, e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commit(f.key, (e.target as HTMLInputElement).value); }}
              className="nameplate h-8 w-full rounded-[9px] px-2 text-right" />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onBoxChange({ ...box, x: (slideW - box.w) / 2 })}
          className="nameplate h-8 flex-1 rounded-[9px] font-display text-[11px]"
        >
          {labels.centerH}
        </button>
        <button
          type="button"
          onClick={() => onBoxChange({ ...box, y: (slideH - box.h) / 2 })}
          className="nameplate h-8 flex-1 rounded-[9px] font-display text-[11px]"
        >
          {labels.centerV}
        </button>
      </div>
    </div>
  );
}
