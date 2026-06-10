"use client";
import { useRef } from "react";

export type BgChoice =
  | { kind: "color"; color: string }
  | { kind: "image"; file: File; url: string };

export function BackgroundPicker(props: {
  value: BgChoice;
  onChange: (b: BgChoice) => void;
  labels: { bgLabel: string; bgImage: string; bgColor: string; bgPick: string };
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-1.5 font-mono text-[11px]" style={{ color: "var(--ink-soft)" }}>{props.labels.bgLabel}</p>
      <div className="flex items-center gap-1.5">
        <div className="flex flex-1 border-b" style={{ borderColor: "var(--hairline)" }}>
          <button type="button"
            onClick={() => fileRef.current?.click()}
            className="flex-1 py-2 font-body text-[12px] font-medium transition-colors"
            style={{
              color: props.value.kind === "image" ? "var(--ink-strong)" : "var(--ink-soft)",
              boxShadow: props.value.kind === "image" ? "inset 0 -2px 0 var(--emphasis)" : undefined,
            }}>{props.labels.bgImage}</button>
          <button type="button"
            onClick={() => props.onChange({ kind: "color", color: props.value.kind === "color" ? props.value.color : "#FFFFFF" })}
            className="flex-1 py-2 font-body text-[12px] font-medium transition-colors"
            style={{
              color: props.value.kind === "color" ? "var(--ink-strong)" : "var(--ink-soft)",
              boxShadow: props.value.kind === "color" ? "inset 0 -2px 0 var(--emphasis)" : undefined,
            }}>{props.labels.bgColor}</button>
        </div>
        {props.value.kind === "color" && (
          <input type="color" value={props.value.color}
            onChange={(e) => props.onChange({ kind: "color", color: e.target.value })}
            aria-label={props.labels.bgColor} className="h-8 w-10 shrink-0 rounded-[5px] border" style={{ borderColor: "var(--border)" }} />
        )}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onChange({ kind: "image", file: f, url: URL.createObjectURL(f) });
            e.target.value = "";
          }} />
      </div>
    </div>
  );
}
