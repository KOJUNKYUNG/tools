"use client";

import { BackgroundFill, type ShownBackground } from "./BackgroundFill";

/**
 * The background row of the settings block: the label, a thumbnail of the
 * current background, and "바꾸기", which opens the shared background editor
 * in the left half.
 */
export function BackgroundRow(props: {
  background: ShownBackground;
  /** The slide's width / height: the thumbnail's shape. */
  ratio: number;
  onChange: () => void;
  labels: { bgLabel: string; bgChange: string };
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <p className="min-w-10 shrink-0 whitespace-nowrap font-mono text-[11px]" style={{ color: "var(--ink-soft)" }}>
        {props.labels.bgLabel}
      </p>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {/* A fixed box: switching the slide's shape moves nothing beside it. */}
        <div className="flex h-[26px] w-[46px] shrink-0 items-center justify-center">
          <div
            className="relative max-h-full max-w-full overflow-hidden rounded-[2px] border"
            style={{
              borderColor: "var(--border)",
              aspectRatio: String(props.ratio),
              height: "100%",
            }}
          >
            <BackgroundFill background={props.background} className="pointer-events-none absolute inset-0 size-full" />
          </div>
        </div>
        <button
          type="button"
          onClick={props.onChange}
          className="subtle-action truncate rounded-[5px] px-2.5 py-1.5 font-body text-[11px]"
        >
          {props.labels.bgChange}
        </button>
      </div>
    </div>
  );
}
