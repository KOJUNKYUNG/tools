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
      <p className="mb-1.5 font-mono text-[11px]" style={{ color: "var(--ink-soft)" }}>{props.labels.alignLabel}</p>
      <div className="flex border-b" style={{ borderColor: "var(--hairline)" }}>
        {opts.map((o) => {
          const active = props.value === o.k;
          return (
            <button key={o.k} type="button"
              onClick={() => props.onChange(o.k)}
              className="flex-1 border-b-2 py-2 font-body text-[12px] font-medium transition-colors"
              style={{
                color: active ? "var(--ink-strong)" : "var(--ink-soft)",
                borderBottomColor: active ? "var(--emphasis)" : "transparent",
              }}>
              {o.lab}
            </button>
          );
        })}
      </div>
    </div>
  );
}
