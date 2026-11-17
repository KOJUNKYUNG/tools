// src/components/tools/ppt-background/CurrentBackgroundFrame.tsx
"use client";

import { template } from "@/lib/common/template";
import type { BackgroundGroup } from "@/lib/ppt/groupBackgrounds";
import { swatchFill } from "./swatchFill";

interface CurrentBackgroundFrameProps {
  caption: string;
  groups: BackgroundGroup[];
  /** blob object URLs keyed by group.key (owned/managed by parent). */
  thumbUrls: Map<string, string>;
  index: number;
  onIndex: (next: number) => void;
  checkedKeys: Set<string>;
  onToggleCheck: (key: string) => void;
  /** aspect-ratio value, e.g. "16 / 9" | "4 / 3" */
  aspect: string;
  /** "슬라이드 {n}장" */
  slideCountTemplate: string;
  emptyLabel: string;
  /** Names of a swatch: a solid colour, or a gradient, a pattern or a colour that could not be resolved. */
  swatchLabels: { solid: string; fill: string };
  zoomLabel: string;
  onZoom: () => void;
}

export function CurrentBackgroundFrame(props: CurrentBackgroundFrameProps) {
  const {
    caption, groups, thumbUrls, index, onIndex, checkedKeys, onToggleCheck,
    aspect, slideCountTemplate, emptyLabel, swatchLabels, zoomLabel, onZoom,
  } = props;
  const group = groups[index];
  const url = group ? thumbUrls.get(group.key) ?? null : null;
  const checked = group ? checkedKeys.has(group.key) : false;
  const swatch = url ? undefined : group?.swatch;

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
        {group ? (
          <>
            {url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={url} alt={caption} className="size-full object-cover" />
            ) : swatch ? (
              /* The deck's own colour, gradient or pattern fills the frame;
                 an unresolved colour shows as neutral hatching. Its name
                 sits above the slide count (below). */
              <div
                className="size-full"
                style={{ background: swatchFill(swatch) }}
              />
            ) : (
              <div className="flex h-full items-center justify-center font-body text-[10.5px]" style={{ color: "var(--ink-soft)" }}>
                {emptyLabel}
              </div>
            )}

            {/* Checkbox is always available (you can target the "no background"
                group too); the zoom only appears when there's an image. */}
            <button
              type="button"
              onClick={() => onToggleCheck(group.key)}
              aria-pressed={checked}
              className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-[5px] border"
              style={{
                background: checked ? "var(--emphasis)" : "color-mix(in oklch, var(--surface) 55%, transparent)",
                borderColor: checked ? "var(--emphasis)" : "color-mix(in oklch, var(--surface) 85%, transparent)",
                // The mark takes the surface colour, the emphasis fill's opposite
                // in either theme (as .btn-download), so it shows in dark mode too.
                color: "var(--surface)",
                backdropFilter: "blur(3px)",
              }}
            >
              {checked && (
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12 L10 17 L19 7" />
                </svg>
              )}
            </button>

            {url && (
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
            )}

            {groups.length > 1 && (
              <div className="absolute bottom-1.5 left-1.5 flex gap-1">
                {(["prev", "next"] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => onIndex((index + (dir === "next" ? 1 : -1) + groups.length) % groups.length)}
                    aria-label={dir}
                    className="flex size-5 items-center justify-center rounded-[5px] font-body text-[11px]"
                    style={{ background: "color-mix(in oklch, var(--surface) 82%, transparent)", color: "var(--ink-strong)", backdropFilter: "blur(4px)" }}
                  >
                    {dir === "next" ? "›" : "‹"}
                  </button>
                ))}
              </div>
            )}

            <div className="absolute bottom-1.5 right-1.5 flex flex-col items-end gap-1">
              {swatch && (
                /* A fixed dark chip, so the name reads on any colour (DESIGN.md, on-content overlays). */
                <span
                  className="rounded-[4px] px-2 py-0.5 font-body text-[10px] font-medium text-white"
                  style={{ background: "rgba(0,0,0,0.7)" }}
                >
                  {swatch.startsWith("#") ? swatchLabels.solid : swatchLabels.fill}
                </span>
              )}
              <div
                className="rounded-[4px] px-2 py-0.5 font-body text-[10px] font-medium"
                style={{ background: "color-mix(in oklch, var(--surface) 82%, transparent)", color: "var(--ink-strong)", backdropFilter: "blur(4px)" }}
              >
                {template(slideCountTemplate, { n: group.slideIndexes.length })}
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center font-body text-[10.5px]" style={{ color: "var(--ink-soft)" }}>
            {emptyLabel}
          </div>
        )}
      </div>
    </div>
  );
}
