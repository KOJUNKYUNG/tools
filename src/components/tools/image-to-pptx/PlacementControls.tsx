"use client";
import { useEffect, useState } from "react";
import type { Box } from "@/lib/pptx/slidePlacement";

interface Props {
  box: Box;
  onBoxChange: (b: Box) => void;
  labels: { placeLabel: string; posX: string; posY: string; sizeW: string; sizeH: string };
}

const FIELDS: { key: keyof Box; lab: "posX" | "posY" | "sizeW" | "sizeH" }[] = [
  { key: "x", lab: "posX" }, { key: "y", lab: "posY" },
  { key: "w", lab: "sizeW" }, { key: "h", lab: "sizeH" },
];

export function PlacementControls({ box, onBoxChange, labels }: Props) {
  const [draft, setDraft] = useState<Record<keyof Box, string>>({ x: "", y: "", w: "", h: "" });
  const [editing, setEditing] = useState<keyof Box | null>(null);

  useEffect(() => {
    if (editing) return;
    setDraft({
      x: String(Math.round(box.x * 100)), y: String(Math.round(box.y * 100)),
      w: String(Math.round(box.w * 100)), h: String(Math.round(box.h * 100)),
    });
  }, [box, editing]);

  const commit = (key: keyof Box, raw: string) => {
    const pct = Math.max(0, Math.min(100, Number(raw) || 0));
    onBoxChange({ ...box, [key]: pct / 100 });
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
    </div>
  );
}
