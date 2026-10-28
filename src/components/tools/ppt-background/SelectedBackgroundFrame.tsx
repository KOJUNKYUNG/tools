// src/components/tools/ppt-background/SelectedBackgroundFrame.tsx
"use client";

import { CroppedImage } from "@/components/image/CroppedImage";
import type { CropRect, ImageDims } from "@/lib/image/maxFitCrop";
import { CornerSpinner } from "@/components/common/CornerSpinner";
import { LiveCanvas, type LivePicture } from "@/components/image/LiveCanvas";

interface SelectedBackgroundFrameProps {
  caption: string;
  previewUrl: string | null;
  /** aspect-ratio value, e.g. "16 / 9" | "4 / 3" */
  aspect: string;
  emptyLabel: string;
  zoomLabel: string;
  onZoom: () => void;
  /** The Background crop; until it is known the picture is centred to fill. */
  crop: CropRect | null;
  /** The size `crop` is held in, when known before the picture loads. */
  sourceSize?: ImageDims;
  /** The live drawing of the pick's edit, laid over the picture; none while it is unedited. */
  live?: LivePicture | null;
  /** Opens the frame over the picture again. */
  onSelect?: () => void;
  /** A picked solid colour (CSS), shown in place of a picture. */
  colour?: string | null;
  /** A note over the colour, e.g. that it is the theme's. */
  colourNote?: string;
  /** The spinner's name while a newer drawing of the preview is on its way; none when it is current. */
  busyLabel?: string | null;
}

export function SelectedBackgroundFrame({
  caption,
  previewUrl,
  aspect,
  emptyLabel,
  zoomLabel,
  onZoom,
  crop,
  sourceSize,
  onSelect,
  colour = null,
  colourNote,
  busyLabel = null,
  live = null,
}: SelectedBackgroundFrameProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div
        className="font-mono text-[10px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--ink-soft)" }}
      >
        {caption}
      </div>
      <div
        className="group relative w-full overflow-hidden rounded-[8px] border"
        style={{ background: "var(--surface-2)", borderColor: "var(--border)", aspectRatio: aspect }}
      >
        {colour ? (
          // A fill has nothing to frame or zoom: the colour is the preview.
          <div role="img" aria-label={colourNote ?? caption} className="size-full" style={{ background: colour }}>
            {colourNote ? (
              <span
                className="absolute bottom-1.5 left-1.5 rounded-[5px] px-1.5 py-0.5 font-body text-[10px]"
                style={{ background: "color-mix(in oklch, var(--surface) 85%, transparent)", color: "var(--ink-strong)" }}
              >
                {colourNote}
              </span>
            ) : null}
          </div>
        ) : previewUrl ? (
          <>
            {onSelect ? (
              <button type="button" onClick={onSelect} aria-label={caption} className="absolute inset-0" />
            ) : null}
            {crop ? (
              <CroppedImage src={previewUrl} alt={caption} crop={crop} sourceSize={sourceSize} className="pointer-events-none size-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={caption} className="pointer-events-none size-full object-cover" />
            )}
            {live && sourceSize ? (
              <LiveCanvas live={live} crop={crop} sourceSize={sourceSize} className="pointer-events-none absolute inset-0 size-full" />
            ) : null}
            {/* Top left: the zoom button takes the top right on hover. */}
            {busyLabel ? <CornerSpinner label={busyLabel} className="left-1.5 top-1.5" /> : null}
            <button
              type="button"
              onClick={onZoom}
              aria-label={zoomLabel}
              className="absolute right-1.5 top-1.5 hidden size-6 items-center justify-center rounded-[6px] group-hover:flex"
              style={{ background: "color-mix(in oklch, var(--surface) 85%, transparent)", color: "var(--ink-strong)", backdropFilter: "blur(4px)" }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="M15.2 15.2 L20 20" />
              </svg>
            </button>
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center font-body text-[10.5px]" style={{ color: "var(--ink-soft)" }}>
            {emptyLabel}
          </div>
        )}
      </div>
    </div>
  );
}
