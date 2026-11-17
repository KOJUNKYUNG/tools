"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import type { Bounds } from "@/lib/ppt/coveringBackgrounds";
import type { Swatch } from "@/lib/ppt/fills";
import { swatchFill } from "./swatchFill";

/** Something the picker lists, as the sketch draws it: a background graphic, the covering background, or a background piece. */
export interface SketchItem {
  /** Its first picture, as a zip path; null without one. */
  imagePath: string | null;
  /** What it shows without a picture; null for none (text, a line). */
  swatch: Swatch | null;
  /** Its box before its turn, as fractions of the slide; null when unknown (it is listed, not drawn). */
  box: Bounds | null;
  /** Its turn about the box's centre, clockwise, in degrees. */
  rotation: number;
  /** It goes with the old background: drawn removed. */
  removed: boolean;
  /** What it is called, for its button. */
  name: string;
  toggle: () => void;
}

interface SlideSketchProps {
  /**
   * The slide's background setting (its own, its layout's or its master's),
   * under every element: its picture, or its colour.
   */
  background: { url: string | null; swatch?: Swatch };
  /**
   * The new background, drawn in place of the background setting to show the
   * slide as it will look; null to show it as it is.
   */
  newBackground: ReactNode | null;
  /** The slide's graphics and pieces, bottom of the stack first. */
  items: readonly SketchItem[];
  /** Object URLs of the pictures loaded so far, by zip path. */
  urls: ReadonlyMap<string, string>;
  /** The item pointed at, here or in the list, by its place in `items`. */
  hovered: number | null;
  /** The pointer or focus is on an item here (its place in `items`), or has left the sketch's items (null). */
  onHover: (index: number | null) => void;
  /** The slide's width over its height. */
  ratio: number;
}

/** How faint an item that goes is drawn: enough to tell what it is. */
const GHOST = 0.25;

/** Where an item lies on a drawing of the slide: its box, turned about its centre. */
export const placed = ({ box, rotation }: { box: Bounds; rotation: number }): CSSProperties => ({
  left: `${box.x * 100}%`,
  top: `${box.y * 100}%`,
  width: `${box.w * 100}%`,
  height: `${box.h * 100}%`,
  transform: rotation ? `rotate(${rotation}deg)` : undefined,
});

/**
 * A sketch of the slide for the picker (spec #163), as it is or, with the new
 * background, as it will look: its background with each background graphic
 * and piece in place, a picture as itself, a fill as its colour, text and a
 * picture the browser cannot draw as a neutral box (text itself is not
 * drawn). The covering background is one of the items, in its place in the
 * stack: the background setting alone lies under them all, and an item under
 * the covering background shows only where that is gone or faint. An item
 * that goes is drawn faint and grey, so it can still be told
 * apart; in the result it is gone, and shows faint only while pointed at.
 * The item pointed at, here or in the list, stands out as the rest of the
 * slide dims around it. Clicking an item ticks or unticks it. As large as the
 * space it is given allows.
 */
export function SlideSketch({ background, newBackground, items, urls, hovered, onHover, ratio }: SlideSketchProps) {
  // Pictures the browser could not draw (EMF, WMF, a damaged file).
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const result = newBackground !== null;

  return (
    <div className="relative min-h-0 flex-1 [container-type:size]">
      <div
        className="relative mx-auto overflow-hidden rounded-[8px] border"
        style={{
          width: `min(100cqw, calc(100cqh * ${ratio}))`,
          aspectRatio: `${ratio}`,
          borderColor: "var(--border)",
          background: !result && !background.url && background.swatch ? swatchFill(background.swatch) : "var(--surface-2)",
        }}
      >
        {result
          ? newBackground
          : background.url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={background.url} alt="" className="absolute inset-0 size-full object-cover" draggable={false} />
            )}
        {items.map((item, i) => {
          const { box, removed, imagePath: path } = item;
          if (!box) return null;
          const url = path && !broken.has(path) ? urls.get(path) : undefined;
          // What goes is drawn faint and grey; in the result it is gone, faint only while pointed at.
          const opacity = !removed ? 1 : result && hovered !== i ? 0 : GHOST;
          return (
            <button
              // By place in the stack: a slide may show the same piece twice.
              key={i}
              type="button"
              aria-pressed={removed}
              aria-label={item.name}
              onClick={item.toggle}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(i)}
              onBlur={() => onHover(null)}
              className="absolute block cursor-pointer overflow-hidden p-0"
              style={{
                // In the slide's own order, ticked or not: where items overlap,
                // the pointer is on the upper one, as on the slide.
                ...placed({ box, rotation: item.rotation }),
              }}
            >
              <span
                aria-hidden
                className="block size-full"
                style={{
                  opacity,
                  filter: removed ? "grayscale(1)" : undefined,
                  transition: "opacity var(--motion-fast) var(--ease-standard)",
                  // A picture not drawn (yet, or ever), text and a fill without a colour: a neutral box.
                  background: url ? undefined : item.swatch ? swatchFill(item.swatch) : "var(--surface-2)",
                  border: url || item.swatch ? undefined : "1px solid var(--border)",
                }}
              >
                {url && path && (
                  /* A picture fills its box; where the slide crops it, the sketch shows its middle. */
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={url}
                    alt=""
                    draggable={false}
                    className="size-full object-cover"
                    onError={() => setBroken((prev) => new Set(prev).add(path))}
                  />
                )}
              </span>
            </button>
          );
        })}
        {/* The item pointed at stands out: the rest of the slide dims around
            it under a fixed dark scrim, with a thin fixed white line on its
            edge for an item as large as the slide (DESIGN.md, on-content
            overlays), so it reads on any picture or colour in either theme. */}
        {hovered !== null && items[hovered]?.box && (
          <span
            aria-hidden
            className="pointer-events-none absolute block"
            style={{
              ...placed({ box: items[hovered].box, rotation: items[hovered].rotation }),
              zIndex: 2,
              outline: "1px solid rgba(255,255,255,0.9)",
              outlineOffset: "-1px",
              boxShadow: "0 0 0 100vmax rgba(0,0,0,0.45)",
            }}
          />
        )}
      </div>
    </div>
  );
}
