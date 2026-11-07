"use client";
import { useRef } from "react";

export type BgChoice =
  | { kind: "color"; color: string }
  | { kind: "image"; file: File; url: string };

const PICTURE_SENTINEL = "#010203";

/**
 * The background row of the settings block: the label, a thumbnail of the
 * current background, and "바꾸기".
 *
 * Interim (#156 → #157): "바꾸기" opens the file picker, and the thumbnail is
 * the colour picker (a native colour input laid over it), so a colour stays
 * choosable. #157 turns "바꾸기" into the shared background editor.
 */
export function BackgroundPicker(props: {
  value: BgChoice;
  onChange: (b: BgChoice) => void;
  /** A picture file was picked; the caller prepares it (HEIC conversion) and sets it. */
  onPickImage: (file: File) => void;
  /** A picked file is still being prepared. */
  busy?: boolean;
  labels: {
    bgLabel: string; bgColor: string; bgChange: string;
    fileUpload: { busy: string };
  };
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { value } = props;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <p className="min-w-10 shrink-0 whitespace-nowrap font-mono text-[11px]" style={{ color: "var(--ink-soft)" }}>
        {props.labels.bgLabel}
      </p>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <label
          className="relative h-[26px] w-[46px] shrink-0 cursor-pointer overflow-hidden rounded-[2px] border"
          style={{
            borderColor: "var(--border)",
            background: value.kind === "color" ? value.color : "var(--surface-2)",
          }}
          title={props.labels.bgColor}
        >
          {value.kind === "image" && (
            <img src={value.url} alt="" draggable={false} className="pointer-events-none size-full object-cover" />
          )}
          <input
            type="color"
            // With a picture set, the input holds a colour nobody picks, so
            // confirming any real colour (white included) is a change.
            value={value.kind === "color" ? value.color : PICTURE_SENTINEL}
            onChange={(e) => props.onChange({ kind: "color", color: e.target.value })}
            aria-label={props.labels.bgColor}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={props.busy}
          aria-busy={props.busy}
          className="file-action truncate rounded-[5px] px-2.5 py-1.5 font-body text-[11px]"
        >
          {props.busy ? props.labels.fileUpload.busy : props.labels.bgChange}
        </button>
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
