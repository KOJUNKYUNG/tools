"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { serializeRange } from "@/lib/common/pageRange";
import { template } from "@/lib/common/template";
import { deckMedia, type SlideBackground } from "@/lib/ppt/extractCurrentBackgrounds";
import type { Swatch } from "@/lib/ppt/fills";
import { swatchFill } from "./swatchFill";

export interface PiecePickerLabels {
  title: string;
  hint: string;
  /** "슬라이드 {n} / {total}" */
  slideTemplate: string;
  previous: string;
  next: string;
  empty: string;
  /** What a row shows: a picture, or a colour. */
  picture: string;
  colour: string;
  /** "슬라이드의 {pct}%" */
  shareTemplate: string;
  /** "슬라이드 {list}": the slides in scope that have it, e.g. "1, 3-16". */
  slidesListTemplate: string;
  /** "{n}장에 있음": the same, when the list does not fit. */
  slidesTemplate: string;
  /** "이 슬라이드에만 있음" */
  onlyHere: string;
  /** "{n}종 고름": the picked pieces on the slides in scope. */
  pickedTemplate: string;
  clearAll: string;
  done: string;
}

interface PiecePickerProps {
  /** The slides in the apply scope, in presentation order, with their background pieces. */
  slides: readonly SlideBackground[];
  /** How many slides the deck has. */
  totalSlides: number;
  /** Keys of the picked pieces (`pieceKey`). */
  picked: ReadonlySet<string>;
  /** How many picked pieces the slides in scope have: those that go. */
  pickedInScope: number;
  onToggle: (key: string) => void;
  /** Keys of the covering-background groups the user keeps (`coveringGroupKey`): unticked here. */
  kept: ReadonlySet<string>;
  onToggleCovering: (key: string) => void;
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

/** The slides among `slides` that have each key, by key. */
function slidesByKey(slides: readonly SlideBackground[], keysOf: (s: SlideBackground) => readonly string[]) {
  const found = new Map<string, Set<number>>();
  for (const s of slides) {
    for (const key of keysOf(s)) found.set(key, (found.get(key) ?? new Set()).add(s.slideIndex));
  }
  return found;
}

/**
 * `full` when it fits on one line in the space it is given, else `short`:
 * measured on an invisible copy, again whenever the space changes.
 */
function FitText({ full, short }: { full: string; short: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const [outer, copy] = [box.current, measure.current];
    if (!outer || !copy) return;
    const check = () => setFits(copy.offsetWidth <= outer.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(outer);
    return () => observer.disconnect();
  }, [full]);
  return (
    <span ref={box} className="relative block min-w-0 truncate" style={{ color: "var(--ink-soft)" }} title={full}>
      <span ref={measure} aria-hidden className="invisible absolute left-0 top-0 whitespace-nowrap">
        {full}
      </span>
      {fits ? full : short}
    </span>
  );
}

/** Where it lies on the slide: its box, turned, hatched over a small slide. */
function MiniMap({ box, rotation, aspect }: { box: { x: number; y: number; w: number; h: number }; rotation: number; aspect: string }) {
  return (
    <span
      className="relative block w-12 shrink-0 overflow-hidden rounded-[3px] border"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)", aspectRatio: aspect }}
      aria-hidden
    >
      <span
        className="absolute block"
        style={{
          left: `${box.x * 100}%`,
          top: `${box.y * 100}%`,
          width: `${box.w * 100}%`,
          height: `${box.h * 100}%`,
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
          border: "1px solid color-mix(in oklch, var(--ink-strong) 55%, transparent)",
          background:
            "repeating-linear-gradient(135deg, color-mix(in oklch, var(--ink-strong) 35%, transparent) 0 1px, transparent 1px 3px)",
        }}
      />
    </span>
  );
}

/**
 * What can go with the old background (spec #163), over the workspace card:
 * a pager through the slides in the apply scope on the left, the shown
 * slide's covering background and pieces on the right, bottom of its stack
 * first, each named a picture or a colour. Its covering background starts
 * ticked (unticking keeps it, sheet music the rule caught); pieces start
 * unticked. Each row shows its picture
 * or colour, where it lies, its size and which slides in scope have it.
 * Ticking one ticks it on every slide that has it.
 */
export function PiecePicker({
  slides,
  totalSlides,
  picked,
  pickedInScope,
  onToggle,
  kept,
  onToggleCovering,
  onClearAll,
  onDone,
  file,
  backgroundOf,
  aspect,
  labels,
}: PiecePickerProps) {
  // Opens on the first slide with anything to pick.
  const [index, setIndex] = useState(() =>
    Math.max(0, slides.findIndex((s) => s.coveringKey !== undefined || s.pieces.length > 0)),
  );
  const slide = slides[index];
  const pieces = useMemo(() => slide?.pieces ?? [], [slide]);
  const pieceSlides = useMemo(() => slidesByKey(slides, (s) => s.pieces.map((p) => p.key)), [slides]);
  const coveringSlides = useMemo(() => slidesByKey(slides, (s) => (s.coveringKey ? [s.coveringKey] : [])), [slides]);
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

  /** Which slides in scope have it: listed when they fit, counted when not, or this slide alone. */
  const where = (found: ReadonlySet<number> | undefined, share?: string) => {
    const on = found ?? new Set<number>();
    const lead = share ? `${share} · ` : "";
    if (on.size <= 1) {
      return (
        <span className="block truncate" style={{ color: "var(--ink-soft)" }}>
          {lead}
          {labels.onlyHere}
        </span>
      );
    }
    return (
      <FitText
        full={lead + template(labels.slidesListTemplate, { list: serializeRange(new Set(on)) })}
        short={lead + template(labels.slidesTemplate, { n: on.size })}
      />
    );
  };

  const row = (key: string, on: boolean, toggle: () => void, thumb: ReactNode, map: ReactNode, name: string, line: ReactNode) => (
    <li key={key}>
      <label
        className="flex cursor-pointer items-center gap-2.5 rounded-[6px] border px-2 py-1.5"
        style={{ borderColor: on ? "var(--emphasis)" : "var(--border)", background: on ? "var(--surface-2)" : "var(--surface)" }}
      >
        <input
          type="checkbox"
          className="size-3.5 shrink-0"
          checked={on}
          onChange={toggle}
          style={{ accentColor: "var(--emphasis)" }}
        />
        {thumb}
        {map}
        <span className="flex min-w-0 flex-1 flex-col font-body text-[11px] leading-[1.35]">
          <span style={{ color: "var(--ink-strong)" }}>{name}</span>
          {line}
        </span>
      </label>
    </li>
  );
  /** Its picture or colour. */
  const thumb = (url: string | null | undefined, swatch: Swatch | null | undefined, fit: "contain" | "cover") => (
    <span
      className="block h-8 w-12 shrink-0 overflow-hidden rounded-[4px] border"
      style={{ borderColor: "var(--border)", background: !url && swatch ? swatchFill(swatch) : "var(--surface-2)" }}
    >
      {url && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={url} alt="" className={`size-full ${fit === "cover" ? "object-cover" : "object-contain"}`} />
      )}
    </span>
  );

  const { coveringKey, coveringPlace } = slide ?? {};
  const empty = !coveringKey && pieces.length === 0;

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
              disabled={slides.length < 2}
              className="subtle-action flex size-6 items-center justify-center rounded-[5px] font-body text-[12px]"
            >
              ‹
            </button>
            <span className="min-w-0 flex-1 text-center font-body text-[11.5px] tabular-nums" style={{ color: "var(--ink-strong)" }}>
              {template(labels.slideTemplate, { n: slide?.slideIndex ?? 0, total: totalSlides })}
            </span>
            <button
              type="button"
              onClick={() => page(1)}
              aria-label={labels.next}
              disabled={slides.length < 2}
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

        {/* Right: the slide's covering background, then its pieces, bottom of the stack first. */}
        <ul className="flex min-h-0 flex-col gap-1.5 overflow-y-auto pr-1">
          {empty && (
            <li className="py-6 text-center font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
              {labels.empty}
            </li>
          )}
          {slide &&
            coveringKey &&
            coveringPlace &&
            row(
              `${slide.slideIndex}:covering`,
              !kept.has(coveringKey),
              () => onToggleCovering(coveringKey),
              thumb(background.url, background.swatch, "cover"),
              <MiniMap box={coveringPlace.box} rotation={0} aspect={aspect} />,
              slide.imagePath ? labels.picture : labels.colour,
              where(coveringSlides.get(coveringKey), template(labels.shareTemplate, { pct: Math.round(coveringPlace.share * 100) })),
            )}
          {pieces.map((piece, i) =>
            // By place in the stack: a slide may show the same piece twice (one picture placed twice).
            row(
              `${slide.slideIndex}:${i}`,
              picked.has(piece.key),
              () => onToggle(piece.key),
              thumb(piece.imagePath ? urls.get(piece.imagePath) : null, piece.swatch, "contain"),
              <MiniMap box={piece.box} rotation={piece.rotation} aspect={aspect} />,
              piece.imagePath ? labels.picture : labels.colour,
              where(pieceSlides.get(piece.key), template(labels.shareTemplate, { pct: Math.round(piece.share * 100) })),
            ),
          )}
        </ul>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t pt-2" style={{ borderColor: "var(--hairline)" }}>
        <span className="min-w-0 flex-1 truncate font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
          {template(labels.pickedTemplate, { n: pickedInScope })}
        </span>
        <button
          type="button"
          onClick={onClearAll}
          disabled={pickedInScope === 0}
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
