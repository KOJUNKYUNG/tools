// src/components/tools/ppt-background/SelectedBackgroundFrame.tsx
"use client";

interface SelectedBackgroundFrameProps {
  caption: string;
  previewUrl: string | null;
  /** aspect-ratio value, e.g. "16 / 9" | "4 / 3" */
  aspect: string;
  emptyLabel: string;
  zoomLabel: string;
  onZoom: () => void;
}

export function SelectedBackgroundFrame({
  caption,
  previewUrl,
  aspect,
  emptyLabel,
  zoomLabel,
  onZoom,
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
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt={caption} className="size-full object-cover" />
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
