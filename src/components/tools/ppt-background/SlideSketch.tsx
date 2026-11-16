"use client";

import { useState, type CSSProperties } from "react";
import type { PiecePreview } from "@/lib/ppt/extractCurrentBackgrounds";
import type { Swatch } from "@/lib/ppt/fills";
import { swatchFill } from "./swatchFill";

interface SlideSketchProps {
  /** The slide's current background: its picture, or its colour. */
  background: { url: string | null; swatch?: Swatch };
  /** The slide's pieces, bottom of the stack first. */
  pieces: readonly PiecePreview[];
  /** Object URLs of the pieces' pictures loaded so far, by zip path. */
  urls: ReadonlyMap<string, string>;
  /** Keys of the picked pieces (`pieceKey`): drawn removed. */
  picked: ReadonlySet<string>;
  onToggle: (key: string) => void;
  /** The piece pointed at, here or in the list, by its place in `pieces`. */
  hovered: number | null;
  /** The pointer or focus is on a piece here (its place in `pieces`), or has left the sketch's pieces (null). */
  onHover: (index: number | null) => void;
  /** What a piece is called, for its button. */
  nameOf: (piece: PiecePreview) => string;
  /** The slide's width over its height. */
  ratio: number;
}

/** Where a piece lies on a drawing of the slide: its box, turned about its centre. */
export const placed = ({ box, rotation }: Pick<PiecePreview, "box" | "rotation">): CSSProperties => ({
  left: `${box.x * 100}%`,
  top: `${box.y * 100}%`,
  width: `${box.w * 100}%`,
  height: `${box.h * 100}%`,
  transform: rotation ? `rotate(${rotation}deg)` : undefined,
});

/**
 * A sketch of the slide for the picker (spec #163): its current background
 * with each piece in place, a picture as itself, a fill as its colour, a
 * picture the browser cannot draw as a neutral box. Text is not drawn, nor a
 * piece under the covering background. A picked piece is drawn removed, as a
 * dashed outline; clicking a piece picks or unpicks it. As large as the space
 * it is given allows.
 */
export function SlideSketch({ background, pieces, urls, picked, onToggle, hovered, onHover, nameOf, ratio }: SlideSketchProps) {
  // Pictures the browser could not draw (EMF, WMF, a damaged file).
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());

  return (
    <div className="relative min-h-0 flex-1 [container-type:size]">
      <div
        className="relative mx-auto overflow-hidden rounded-[8px] border"
        style={{
          width: `min(100cqw, calc(100cqh * ${ratio}))`,
          aspectRatio: `${ratio}`,
          borderColor: "var(--border)",
          background: !background.url && background.swatch ? swatchFill(background.swatch) : "var(--surface-2)",
        }}
      >
        {background.url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={background.url} alt="" className="size-full object-cover" draggable={false} />
        )}
        {pieces.map((piece, i) => {
          // Under the covering background (a background graphic under the
          // slide's photo) it does not show today, so it is not drawn over it;
          // its outline still marks it, and its row picks it.
          if (piece.underCovering) return null;
          const removed = picked.has(piece.key);
          const path = piece.imagePath;
          const url = path && !broken.has(path) ? urls.get(path) : undefined;
          return (
            <button
              // By place in the stack: a slide may show the same piece twice.
              key={i}
              type="button"
              aria-pressed={removed}
              aria-label={nameOf(piece)}
              onClick={() => onToggle(piece.key)}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(i)}
              onBlur={() => onHover(null)}
              className="absolute block cursor-pointer overflow-hidden p-0"
              style={{
                ...placed(piece),
                // A removed piece shows nothing, so it lies under the pieces
                // still drawn: a click on one that shows reaches it, and the
                // removed one's empty box still takes a click to bring it back.
                zIndex: removed ? 0 : 1,
                // A picture not drawn (yet, or ever) and a fill without a colour: a neutral box.
                background: removed || url ? "transparent" : piece.swatch ? swatchFill(piece.swatch) : "var(--surface-2)",
                border: removed || url || piece.swatch ? undefined : "1px solid var(--border)",
              }}
            >
              {!removed && url && path && (
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
            </button>
          );
        })}
        {/* Outlines lie over every piece, a fixed white line on a fixed dark
            one (DESIGN.md, on-content overlays), so they read on any picture
            or colour in either theme: dashed for a removed piece, solid for
            the one pointed at. */}
        {pieces.map((piece, i) => {
          const removed = picked.has(piece.key);
          if (!removed && hovered !== i) return null;
          const width = hovered === i ? 2 : 1.5;
          return (
            <span
              key={i}
              aria-hidden
              className="pointer-events-none absolute block"
              style={{
                ...placed(piece),
                zIndex: 2,
                outline: `${width}px ${removed ? "dashed" : "solid"} white`,
                outlineOffset: `-${width}px`,
                boxShadow: `inset 0 0 0 ${width + 1}px rgba(0,0,0,0.7)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
