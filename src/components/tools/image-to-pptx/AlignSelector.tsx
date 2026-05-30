"use client";
import type { PlacementAlign } from "@/lib/pptx/slidePlacement";

export function AlignSelector(props: {
  value: PlacementAlign;
  onChange: (a: PlacementAlign) => void;
  labels: { alignLabel: string; alignTopLeft: string; alignCenter: string };
}) {
  const opts: { k: PlacementAlign; lab: string }[] = [
    { k: "top-left", lab: props.labels.alignTopLeft },
    { k: "center", lab: props.labels.alignCenter },
  ];
  return (
    <div>
      <p className="mb-1.5 font-display text-[11px]" style={{ color: "var(--ink-soft)" }}>{props.labels.alignLabel}</p>
      <div className="flex gap-1.5">
        {opts.map((o) => (
          <button key={o.k} type="button" data-active={props.value === o.k}
            onClick={() => props.onChange(o.k)}
            className="nameplate h-8 flex-1 rounded-[9px] px-3 font-display text-[12px] font-medium">
            {o.lab}
          </button>
        ))}
      </div>
    </div>
  );
}
