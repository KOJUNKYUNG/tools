"use client";

import { CheckIcon } from "lucide-react";
import type { SlideBackground } from "@/lib/ppt/extractCurrentBackgrounds";

interface SlideThumbStripProps {
  backgrounds: SlideBackground[];
  thumbnailUrls: Map<number, string>;
  /** When non-null, the strip is interactive: clicks toggle selection. */
  selectable: { selected: Set<number>; onToggle: (slideIndex1Based: number) => void } | null;
  labels: {
    emptyThumb: string;     // "배경 없음"
    sourceByKey: Record<"slide" | "layout" | "master", string>;
  };
}

export function SlideThumbStrip({
  backgrounds,
  thumbnailUrls,
  selectable,
  labels,
}: SlideThumbStripProps) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}
    >
      {backgrounds.map((bg) => {
        const url = thumbnailUrls.get(bg.slideIndex);
        const ord = bg.slideIndex; // 1-based per extractCurrentBackgrounds
        const isSelected = selectable?.selected.has(ord) ?? false;
        const isInteractive = selectable !== null;

        const baseStyle: React.CSSProperties = {
          background: "var(--surface-2)",
          borderColor: "var(--border)",
          borderWidth: 1,
          outline: isSelected ? "2px solid var(--emphasis)" : undefined,
          outlineOffset: isSelected ? "-2px" : undefined,
          cursor: isInteractive ? "pointer" : "default",
        };

        const inner = (
          <>
            <div className="relative aspect-video overflow-hidden">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={bg.slideName} className="size-full object-cover" />
              ) : (
                <div
                  className="flex size-full items-center justify-center font-body text-[10px]"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {labels.emptyThumb}
                </div>
              )}
              {isSelected && (
                <div
                  className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full"
                  style={{ background: "var(--emphasis)", color: "var(--surface)" }}
                >
                  <CheckIcon className="size-3" />
                </div>
              )}
            </div>
            <div className="px-1.5 py-1 text-center">
              <p
                className="truncate font-body text-[10px] font-medium"
                style={{ color: "var(--ink-strong)" }}
              >
                {bg.slideName}
              </p>
              {bg.source !== "none" && (
                <p className="font-body text-[9.5px]" style={{ color: "var(--ink-soft)" }}>
                  {labels.sourceByKey[bg.source]}
                </p>
              )}
            </div>
          </>
        );

        return isInteractive ? (
          <button
            key={bg.slideIndex}
            type="button"
            onClick={() => selectable!.onToggle(ord)}
            className="overflow-hidden rounded-[6px] border text-left transition-colors"
            style={baseStyle}
          >
            {inner}
          </button>
        ) : (
          <div
            key={bg.slideIndex}
            className="overflow-hidden rounded-[6px] border"
            style={baseStyle}
          >
            {inner}
          </div>
        );
      })}
    </div>
  );
}
