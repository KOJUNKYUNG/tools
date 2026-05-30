"use client";
import type { SlideKind } from "@/lib/pptx/slideSize";

export function SlideAspectSelector(props: {
  value: SlideKind;
  onChange: (k: SlideKind) => void;
  labels: { slideAspectLabel: string; aspect169: string; aspect43: string };
}) {
  const opts: { k: SlideKind; lab: string }[] = [
    { k: "16:9", lab: props.labels.aspect169 },
    { k: "4:3", lab: props.labels.aspect43 },
  ];
  return (
    <div>
      <p className="mb-1.5 font-display text-[11px]" style={{ color: "var(--ink-soft)" }}>{props.labels.slideAspectLabel}</p>
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
