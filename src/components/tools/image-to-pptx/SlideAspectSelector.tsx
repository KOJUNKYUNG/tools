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
      <p className="mb-1.5 font-mono text-[11px]" style={{ color: "var(--ink-soft)" }}>{props.labels.slideAspectLabel}</p>
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
