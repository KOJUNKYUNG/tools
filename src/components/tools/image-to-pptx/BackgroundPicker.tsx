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
      <p className="mb-1.5 font-display text-[11px]" style={{ color: "var(--ink-soft)" }}>{props.labels.bgLabel}</p>
      <div className="flex items-center gap-1.5">
        <button type="button" data-active={props.value.kind === "image"}
          onClick={() => fileRef.current?.click()}
          className="nameplate h-8 flex-1 rounded-[9px] px-3 text-[12px]">{props.labels.bgImage}</button>
        <button type="button" data-active={props.value.kind === "color"}
          onClick={() => props.onChange({ kind: "color", color: props.value.kind === "color" ? props.value.color : "#FFFFFF" })}
          className="nameplate h-8 flex-1 rounded-[9px] px-3 text-[12px]">{props.labels.bgColor}</button>
        {props.value.kind === "color" && (
          <input type="color" value={props.value.color}
            onChange={(e) => props.onChange({ kind: "color", color: e.target.value })}
            aria-label={props.labels.bgColor} className="h-8 w-10 rounded-[9px] border" />
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
