"use client";

/** The zoom button over a preview, shown at the top right while the preview (a `group`) is hovered. */
export function ZoomButton({ label, onZoom }: { label: string; onZoom: () => void }) {
  return (
    <button
      type="button"
      onClick={onZoom}
      aria-label={label}
      className="absolute right-1.5 top-1.5 hidden size-6 items-center justify-center rounded-[6px] group-hover:flex"
      style={{ background: "color-mix(in oklch, var(--surface) 85%, transparent)", color: "var(--ink-strong)", backdropFilter: "blur(4px)" }}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.2 15.2 L20 20" />
      </svg>
    </button>
  );
}
