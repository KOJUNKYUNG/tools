"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { template } from "@/lib/common/template";
import { deckMedia, type SlideBackground } from "@/lib/ppt/extractCurrentBackgrounds";
import type { Swatch } from "@/lib/ppt/fills";

export interface PiecePickerLabels {
  title: string;
  hint: string;
  /** "슬라이드 {n} / {total}" */
  slideTemplate: string;
  previous: string;
  next: string;
  empty: string;
  /** What a piece shows: a picture, or a colour. */
  picture: string;
  colour: string;
  /** "슬라이드의 {pct}%" */
  shareTemplate: string;
  /** "{n}장에 있음" */
  slidesTemplate: string;
  /** "{n}종 고름" */
  pickedTemplate: string;
  clearAll: string;
  done: string;
}

interface PiecePickerProps {
  /** Every slide, in presentation order, with its background pieces. */
  slides: readonly SlideBackground[];
  /** Keys of the picked pieces (`pieceKey`). */
  picked: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onClearAll: () => void;
  onDone: () => void;
  /** The deck: a piece's picture is read from it when its slide is shown. */
  file: File;
  /** The slide's current background (its group's thumbnail or swatch), by 1-based slide number. */
  backgroundOf: (slideIndex: number) => { url: string | null; swatch?: Swatch };
  /** aspect-ratio value, e.g. "16 / 9" */
  aspect: string;
  labels: PiecePickerLabels;
}

/** A neutral hatch for a gradient, a pattern or an unresolved colour, as the current-background frame shows it. */
const HATCH = "repeating-linear-gradient(135deg, var(--surface-2) 0 6px, var(--border) 6px 7px)";
const swatchFill = (swatch: Swatch) => (swatch === "fill" ? HATCH : swatch);

/**
 * The background-piece picker (spec #163): over the workspace card, a pager
 * through the slides on the left and the shown slide's pieces on the right,
 * bottom of its stack first, each with its picture or colour, where it lies,
 * its size and how many slides have it. Ticking a piece picks it on every
 * slide that has it.
 */
export function PiecePicker({
  slides,
  picked,
  onToggle,
  onClearAll,
  onDone,
  file,
  backgroundOf,
  aspect,
  labels,
}: PiecePickerProps) {
  // Opens on the first slide that has pieces.
  const [index, setIndex] = useState(() => Math.max(0, slides.findIndex((s) => s.pieces.length > 0)));
  const slide = slides[index];
  const pieces = useMemo(() => slide?.pieces ?? [], [slide]);
  // The deck is read once, on the first picture.
  const [loadMedia] = useState(() => deckMedia(file));

  // Pictures are read from the deck as their slide is shown, each once.
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(new Map());
  const urlsRef = useRef(new Map<string, string>());
  const loading = useRef(new Set<string>());
  const mounted = useRef(false);
  // Declared first, so a remount (React's strict mode) starts the loads anew.
  useEffect(() => {
    const [owned, started] = [urlsRef.current, loading.current];
    mounted.current = true;
    return () => {
      mounted.current = false;
      owned.forEach((url) => URL.revokeObjectURL(url));
      owned.clear();
      started.clear();
    };
  }, []);
  useEffect(() => {
    for (const path of pieces.flatMap((p) => (p.imagePath ? [p.imagePath] : []))) {
      if (loading.current.has(path)) continue;
      loading.current.add(path);
      void loadMedia(path).then((blob) => {
        // Loaded twice (a remount), or after the picker closed: nothing to show it in.
        if (!blob || !mounted.current || urlsRef.current.has(path)) return;
        urlsRef.current.set(path, URL.createObjectURL(blob));
        setUrls(new Map(urlsRef.current));
      });
    }
  }, [pieces, loadMedia]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  const page = (step: number) => setIndex((i) => (i + step + slides.length) % slides.length);
  const background = slide ? backgroundOf(slide.slideIndex) : { url: null };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
      className="absolute inset-0 z-20 flex flex-col gap-2 px-6 py-3"
      style={{ background: "var(--surface)" }}
    >
      <div className="shrink-0">
        <div className="font-ko text-[14px] font-medium" style={{ color: "var(--ink-strong)" }}>
          {labels.title}
        </div>
        <p className="line-clamp-2 font-body text-[11px] leading-[1.4]" style={{ color: "var(--ink-soft)" }} title={labels.hint}>
          {labels.hint}
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-4" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 3fr)" }}>
        {/* Left: the pager over the slide's current background. */}
        <div className="flex min-h-0 flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => page(-1)}
              aria-label={labels.previous}
              className="subtle-action flex size-6 items-center justify-center rounded-[5px] font-body text-[12px]"
            >
              ‹
            </button>
            <span className="min-w-0 flex-1 text-center font-body text-[11.5px] tabular-nums" style={{ color: "var(--ink-strong)" }}>
              {template(labels.slideTemplate, { n: slide?.slideIndex ?? 0, total: slides.length })}
            </span>
            <button
              type="button"
              onClick={() => page(1)}
              aria-label={labels.next}
              className="subtle-action flex size-6 items-center justify-center rounded-[5px] font-body text-[12px]"
            >
              ›
            </button>
          </div>
          <div
            className="relative w-full overflow-hidden rounded-[8px] border"
            style={{
              borderColor: "var(--border)",
              aspectRatio: aspect,
              background: background.url ? "var(--surface-2)" : background.swatch ? swatchFill(background.swatch) : "var(--surface-2)",
            }}
          >
            {background.url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={background.url} alt="" className="size-full object-cover" />
            )}
          </div>
        </div>

        {/* Right: the slide's pieces, bottom of the stack first. */}
        <ul className="flex min-h-0 flex-col gap-1.5 overflow-y-auto pr-1">
          {pieces.length === 0 && (
            <li className="py-6 text-center font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
              {labels.empty}
            </li>
          )}
          {pieces.map((piece, i) => {
            const url = piece.imagePath ? urls.get(piece.imagePath) : undefined;
            const on = picked.has(piece.key);
            return (
              // By place in the stack: a slide may show the same piece twice (one picture placed twice).
              <li key={`${slide.slideIndex}:${i}`}>
                <label
                  className="flex cursor-pointer items-center gap-2.5 rounded-[6px] border px-2 py-1.5"
                  style={{ borderColor: on ? "var(--emphasis)" : "var(--border)", background: on ? "var(--surface-2)" : "var(--surface)" }}
                >
                  <input
                    type="checkbox"
                    className="size-3.5 shrink-0"
                    checked={on}
                    onChange={() => onToggle(piece.key)}
                    style={{ accentColor: "var(--emphasis)" }}
                  />
                  {/* Its picture or colour. */}
                  <span
                    className="block h-8 w-12 shrink-0 overflow-hidden rounded-[4px] border"
                    style={{ borderColor: "var(--border)", background: piece.swatch ? swatchFill(piece.swatch) : "var(--surface-2)" }}
                  >
                    {url && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={url} alt="" className="size-full object-contain" />
                    )}
                  </span>
                  {/* Where it lies on the slide. */}
                  <span
                    className="relative block w-12 shrink-0 overflow-hidden rounded-[3px] border"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)", aspectRatio: aspect }}
                    aria-hidden
                  >
                    <span
                      className="absolute block rounded-[1px]"
                      style={{
                        left: `${piece.box.x * 100}%`,
                        top: `${piece.box.y * 100}%`,
                        width: `${piece.box.w * 100}%`,
                        height: `${piece.box.h * 100}%`,
                        background: "var(--ink-strong)",
                        opacity: 0.55,
                      }}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col font-body text-[11px] leading-[1.35]">
                    <span style={{ color: "var(--ink-strong)" }}>{piece.imagePath ? labels.picture : labels.colour}</span>
                    <span className="truncate" style={{ color: "var(--ink-soft)" }}>
                      {template(labels.shareTemplate, { pct: Math.round(piece.share * 100) })}
                      {" · "}
                      {template(labels.slidesTemplate, { n: piece.slideCount })}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t pt-2" style={{ borderColor: "var(--hairline)" }}>
        <span className="min-w-0 flex-1 truncate font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
          {template(labels.pickedTemplate, { n: picked.size })}
        </span>
        <button
          type="button"
          onClick={onClearAll}
          disabled={picked.size === 0}
          className="subtle-action rounded-[5px] px-2.5 py-1.5 font-body text-[11px]"
        >
          {labels.clearAll}
        </button>
        <button type="button" onClick={onDone} className="btn-primary rounded-[6px] px-3.5 py-1.5 font-body text-[11.5px] font-medium">
          {labels.done}
        </button>
      </div>
    </div>
  );
}
