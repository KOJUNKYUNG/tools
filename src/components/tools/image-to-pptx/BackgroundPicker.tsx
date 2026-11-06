"use client";
import { useRef } from "react";

export type BgChoice =
  | { kind: "color"; color: string }
  | { kind: "image"; file: File; url: string };

export function BackgroundPicker(props: {
  value: BgChoice;
  onChange: (b: BgChoice) => void;
  /** A picture file was picked; the caller prepares it (HEIC conversion) and sets it. */
  onPickImage: (file: File) => void;
  /** A picked file is still being prepared. */
  busy?: boolean;
  labels: {
    bgLabel: string; bgImage: string; bgColor: string; bgPick: string;
    fileUpload: { busy: string };
  };
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-1.5 font-mono text-[11px]" style={{ color: "var(--ink-soft)" }}>{props.labels.bgLabel}</p>
      <div className="flex items-center gap-1.5">
        <div className="flex flex-1 border-b" style={{ borderColor: "var(--hairline)" }}>
          <button type="button"
            onClick={() => fileRef.current?.click()}
            disabled={props.busy}
            aria-busy={props.busy}
            className="flex-1 border-b-2 py-2 font-body text-[12px] font-medium transition-colors disabled:cursor-not-allowed"
            style={{
              color: props.value.kind === "image" ? "var(--ink-strong)" : "var(--ink-soft)",
              borderBottomColor: props.value.kind === "image" ? "var(--emphasis)" : "transparent",
            }}>{props.busy ? props.labels.fileUpload.busy : props.labels.bgImage}</button>
          <button type="button"
            onClick={() => props.onChange({ kind: "color", color: props.value.kind === "color" ? props.value.color : "#FFFFFF" })}
            className="flex-1 border-b-2 py-2 font-body text-[12px] font-medium transition-colors"
            style={{
              color: props.value.kind === "color" ? "var(--ink-strong)" : "var(--ink-soft)",
              borderBottomColor: props.value.kind === "color" ? "var(--emphasis)" : "transparent",
            }}>{props.labels.bgColor}</button>
        </div>
        {props.value.kind === "color" && (
          <input type="color" value={props.value.color}
            onChange={(e) => props.onChange({ kind: "color", color: e.target.value })}
            aria-label={props.labels.bgColor} className="h-8 w-10 shrink-0 rounded-[5px] border" style={{ borderColor: "var(--border)" }} />
        )}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/heic,image/heif,.heic,.heif" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onPickImage(f);
            e.target.value = "";
          }} />
      </div>
    </div>
  );
}
