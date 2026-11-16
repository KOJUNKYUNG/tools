"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { serializeRange } from "@/lib/common/pageRange";
import { template } from "@/lib/common/template";
import { deckMedia, type SlideBackground } from "@/lib/ppt/extractCurrentBackgrounds";
import type { Swatch } from "@/lib/ppt/fills";
import { placed, SlideSketch } from "./SlideSketch";
import { swatchFill } from "./swatchFill";

export interface PiecePickerLabels {
  title: string;
  hint: string;
  /** "슬라이드 {n} / {total}" */
  slideTemplate: string;
  previous: string;
  next: string;
  /** "적용 슬라이드만": the pager goes through the slides in the apply scope only. */
  onlyInScope: string;
  /** "요소가 있는 슬라이드만": the pager skips slides with nothing to pick. */
  onlyWithElements: string;
  /** "적용 안 함": beside the slide number, when the slide shown is outside the apply scope. */
  outOfScope: string;
  empty: string;
  /** What a row shows: a picture, or a colour. */
  picture: string;
  colour: string;
  /** "슬라이드의 {pct}%" */
  shareTemplate: string;
  /** "슬라이드 {list}": the slides listed (in scope, or all) that have it, e.g. "1, 3-16". */
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
  /** The deck's slides, in presentation order, with their background pieces. */
  slides: readonly SlideBackground[];
  /** The numbers of the slides in the apply scope: only their picks go. */
  inScope: ReadonlySet<number>;
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
  /** The slide's width over its height. */
  ratio: number;
  labels: PiecePickerLabels;
}

/** Whether the slide has anything to pick: a covering background, or a piece. */
const hasElements = (s: SlideBackground) => s.coveringKey !== undefined || s.pieces.length > 0;

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
          ...placed({ box, rotation }),
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
 * unticked. Each row shows its picture or colour, where it lies, its size and
 * which slides in scope have it. Ticking one ticks it on every slide that has
 * it. Under the pager, a sketch of the slide with its pieces in place:
 * pointing at a piece in the list or in the sketch marks it in both, and
 * clicking it in the sketch picks it too. The pager skips slides with nothing
 * to pick unless the user asks for them all.
 */
export function PiecePicker({
  slides: deck,
  inScope,
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
  ratio,
  labels,
}: PiecePickerProps) {
  // The slides listed: those in the apply scope (the default), or the whole
  // deck, to look at a slide that is not changing. A pick there still goes
  // only from the slides in scope that have it.
  const [onlyInScope, setOnlyInScope] = useState(true);
  const slides = useMemo(() => (onlyInScope ? deck.filter((s) => inScope.has(s.slideIndex)) : deck), [deck, inScope, onlyInScope]);
  const [onlyWithElements, setOnlyWithElements] = useState(true);
  const paged = useMemo(() => (onlyWithElements ? slides.filter(hasElements) : slides), [slides, onlyWithElements]);
  // The slide shown, by its number: it stays when a switch changes the
  // slides paged through, and the next one takes over when it drops out.
  const [current, setCurrent] = useState(() => slides.find(hasElements)?.slideIndex ?? 1);
  const index = Math.max(0, paged.findIndex((s) => s.slideIndex >= current));
  const slide = paged.at(index);
  /** The piece pointed at, by its place in the slide's pieces, and where: the list follows the sketch. */
  const [hovered, setHovered] = useState<{ index: number; from: "list" | "sketch" } | null>(null);
  const hoveredRow = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (hovered?.from === "sketch") hoveredRow.current?.scrollIntoView({ block: "nearest" });
  }, [hovered]);
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

  const page = (step: number) => {
    const next = paged.at((index + step + paged.length) % paged.length);
    if (next) setCurrent(next.slideIndex);
    setHovered(null);
  };
  const background = slide ? backgroundOf(slide.slideIndex) : { url: null };

  /** Which of the slides listed have it: listed when they fit, counted when not, or this slide alone. */
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

  const row = (
    key: string,
    on: boolean,
    toggle: () => void,
    thumb: ReactNode,
    map: ReactNode,
    name: string,
    line: ReactNode,
    /** A piece's place in the slide's pieces: pointing at its row marks it in the sketch. */
    piece?: number,
  ) => (
    <li
      key={key}
      ref={piece !== undefined && hovered?.index === piece ? hoveredRow : undefined}
      onMouseEnter={piece === undefined ? undefined : () => setHovered({ index: piece, from: "list" })}
      onMouseLeave={piece === undefined ? undefined : () => setHovered(null)}
    >
      <label
        className="flex cursor-pointer items-center gap-2.5 rounded-[6px] border px-2 py-1.5"
        style={{
          borderColor: on ? "var(--emphasis)" : "var(--border)",
          background: on ? "var(--surface-2)" : "var(--surface)",
          // Drawn inside the row, so marking it moves nothing.
          outline: piece !== undefined && hovered?.index === piece ? "1px solid var(--emphasis)" : undefined,
          outlineOffset: "-1px",
        }}
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
  /** A row's name and size: a picture or a colour, and its share of the slide. */
  const kindOf = (imagePath: string | null) => (imagePath ? labels.picture : labels.colour);
  const shareOf = (share: number) => template(labels.shareTemplate, { pct: Math.round(share * 100) });
  const pieceName = (piece: (typeof pieces)[number]) => `${kindOf(piece.imagePath)} · ${shareOf(piece.share)}`;
  // Nothing to skip when every slide listed has something to pick (a master
  // picture on every slide, the common case): the switch is hidden, its place kept.
  const allHaveElements = slides.every(hasElements);
  /** A switch over the pager's slides; a hidden one keeps its place, so nothing moves. */
  const switchBox = (label: string, on: boolean, set: (next: boolean) => void, hidden = false) => (
    <label
      className={`flex cursor-pointer items-center gap-1.5 font-body text-[11px] ${hidden ? "invisible" : ""}`}
      style={{ color: "var(--ink-strong)" }}
    >
      <input
        type="checkbox"
        className="size-3.5 shrink-0"
        checked={on}
        disabled={hidden}
        onChange={(e) => {
          set(e.target.checked);
          setHovered(null);
        }}
        style={{ accentColor: "var(--emphasis)" }}
      />
      {label}
    </label>
  );

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
        {/* Left: the pager, the switch to skip slides with nothing to pick, and the slide's sketch. */}
        <div className="flex min-h-0 flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => page(-1)}
              aria-label={labels.previous}
              disabled={paged.length < 2}
              className="subtle-action flex size-6 items-center justify-center rounded-[5px] font-body text-[12px]"
            >
              ‹
            </button>
            <span className="min-w-0 flex-1 truncate text-center font-body text-[11.5px] tabular-nums" style={{ color: "var(--ink-strong)" }}>
              {template(labels.slideTemplate, { n: slide?.slideIndex ?? 0, total: totalSlides })}
              {slide && !inScope.has(slide.slideIndex) && (
                <span style={{ color: "var(--ink-soft)" }}>{` · ${labels.outOfScope}`}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => page(1)}
              aria-label={labels.next}
              disabled={paged.length < 2}
              className="subtle-action flex size-6 items-center justify-center rounded-[5px] font-body text-[12px]"
            >
              ›
            </button>
          </div>
          {/* The scope switch first: it is always there, the other may be hidden. */}
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
            {switchBox(labels.onlyInScope, onlyInScope, setOnlyInScope)}
            {switchBox(labels.onlyWithElements, onlyWithElements, setOnlyWithElements, allHaveElements)}
          </div>
          <SlideSketch
            background={background}
            pieces={pieces}
            urls={urls}
            picked={picked}
            onToggle={onToggle}
            hovered={hovered?.index ?? null}
            // Leaving a piece here (or its focus moving to the list) clears
            // only what the sketch marked, never the row the pointer is on.
            onHover={(i) =>
              setHovered((prev) => (i !== null ? { index: i, from: "sketch" } : prev?.from === "sketch" ? null : prev))
            }
            nameOf={pieceName}
            ratio={ratio}
          />
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
              kindOf(slide.imagePath),
              where(coveringSlides.get(coveringKey), shareOf(coveringPlace.share)),
            )}
          {pieces.map((piece, i) =>
            // By place in the stack: a slide may show the same piece twice (one picture placed twice).
            row(
              `${slide?.slideIndex}:${i}`,
              picked.has(piece.key),
              () => onToggle(piece.key),
              thumb(piece.imagePath ? urls.get(piece.imagePath) : null, piece.swatch, "contain"),
              <MiniMap box={piece.box} rotation={piece.rotation} aspect={aspect} />,
              kindOf(piece.imagePath),
              where(pieceSlides.get(piece.key), shareOf(piece.share)),
              i,
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
