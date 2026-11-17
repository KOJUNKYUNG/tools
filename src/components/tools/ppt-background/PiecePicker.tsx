"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { serializeRange } from "@/lib/common/pageRange";
import { template } from "@/lib/common/template";
import { deckMedia, type GraphicPreview, type PiecePreview, type SlideBackground } from "@/lib/ppt/extractCurrentBackgrounds";
import type { Swatch } from "@/lib/ppt/fills";
import { placed, SlideSketch, type SketchItem } from "./SlideSketch";
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
  /** "새 배경으로 보기": the sketch shows the slide as it will look. */
  newView: string;
  /** "적용 안 함": beside the slide number, when the slide shown is outside the apply scope. */
  outOfScope: string;
  empty: string;
  /** What a row shows: a picture, a colour, text, or another shape (a line, a table). */
  picture: string;
  colour: string;
  text: string;
  shape: string;
  /** "슬라이드의 {pct}%" */
  shareTemplate: string;
  /** "슬라이드 {list}": the slides listed (in scope, or all) that have it, e.g. "1, 3-16". */
  slidesListTemplate: string;
  /** "{n}장에 있음": the same, when the list does not fit. */
  slidesTemplate: string;
  /** "배경 그래픽": after a row's name, for an element of the master or a layout. */
  graphic: string;
  /** "배경 그래픽 {n}개 함께 지움": the background graphics going on the slides in scope. */
  graphicsSummaryTemplate: string;
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
  /** Keys of the background graphics the user keeps (`graphicKey`): unticked here; the rest go. */
  keptGraphics: ReadonlySet<string>;
  onToggleGraphic: (key: string) => void;
  /** How many background graphics go on the slides in scope. */
  graphicsGoing: number;
  /** The new background as the sketch draws it; null until one is picked. */
  newBackground: ReactNode | null;
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

/** Whether the slide has anything to pick: a covering background, a background graphic, or a piece. */
const hasElements = (s: SlideBackground) => s.coveringKey !== undefined || s.graphics.length > 0 || s.pieces.length > 0;

/** The covering background's place for pointing: its row is marked, the sketch has no item for it (it is the background). */
const COVERING_ROW = -1;

/** A row of the list, and an item of the sketch: a background graphic, or a piece. */
type Entry = { graphic: GraphicPreview; piece?: undefined } | { piece: PiecePreview; graphic?: undefined };

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

/** Where it lies on the slide: its box, turned, hatched over a small slide; an empty slide when unknown. */
function MiniMap({ box, rotation, aspect }: { box: { x: number; y: number; w: number; h: number } | null; rotation: number; aspect: string }) {
  return (
    <span
      className="relative block w-12 shrink-0 overflow-hidden rounded-[3px] border"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)", aspectRatio: aspect }}
      aria-hidden
    >
      {box && (
        <span
          className="absolute block"
          style={{
            ...placed({ box, rotation }),
            border: "1px solid color-mix(in oklch, var(--ink-strong) 55%, transparent)",
            background:
              "repeating-linear-gradient(135deg, color-mix(in oklch, var(--ink-strong) 35%, transparent) 0 1px, transparent 1px 3px)",
          }}
        />
      )}
    </span>
  );
}

/**
 * What goes with the old background (spec #163), over the workspace card:
 * a pager through the slides in the apply scope on the left, the shown
 * slide's covering background, background graphics and pieces on the right,
 * bottom of its stack first, each named by what it shows. Its covering
 * background and background graphics (the master's and layout's elements)
 * start ticked: they are the old background, and unticking one keeps it
 * (sheet music the rule caught, a logo); pieces start unticked. Each row
 * shows its picture or colour, where it lies, its size and which slides in
 * scope have it. Ticking one ticks it on every slide that has it. Under the
 * pager, a sketch of the slide with its graphics and pieces in place, as it
 * is or with the new background: pointing at one in the list or in the
 * sketch marks it in both, and clicking it in the sketch ticks it too. The
 * pager skips slides with nothing to pick unless the user asks for them all.
 */
export function PiecePicker({
  slides: deck,
  inScope,
  totalSlides,
  picked,
  pickedInScope,
  onToggle,
  keptGraphics,
  onToggleGraphic,
  graphicsGoing,
  newBackground,
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
  /** The entry pointed at, by its place in the slide's entries, and where: the list follows the sketch. */
  const [hovered, setHovered] = useState<{ index: number; from: "list" | "sketch" } | null>(null);
  const hoveredRow = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (hovered?.from === "sketch") hoveredRow.current?.scrollIntoView({ block: "nearest" });
  }, [hovered]);
  // The slide's background graphics, then its pieces: its stack from the bottom.
  const entries = useMemo(
    (): Entry[] => [...(slide?.graphics ?? []).map((graphic) => ({ graphic })), ...(slide?.pieces ?? []).map((piece) => ({ piece }))],
    [slide],
  );
  const pieceSlides = useMemo(() => slidesByKey(slides, (s) => s.pieces.map((p) => p.key)), [slides]);
  const graphicSlides = useMemo(() => slidesByKey(slides, (s) => s.graphics.map((g) => g.key)), [slides]);
  /** The sketch shows the slide with the new background, as it will look. */
  const [resultView, setResultView] = useState(false);
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
    for (const path of entries.flatMap((e) => ((e.graphic ?? e.piece).imagePath ?? []))) {
      if (loading.current.has(path)) continue;
      loading.current.add(path);
      void loadMedia(path).then((blob) => {
        // Loaded twice (a remount), or after the picker closed: nothing to show it in.
        if (!blob || !mounted.current || urlsRef.current.has(path)) return;
        urlsRef.current.set(path, URL.createObjectURL(blob));
        setUrls(new Map(urlsRef.current));
      });
    }
  }, [entries, loadMedia]);

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
    /** An entry's place in the slide's entries: pointing at its row marks it in the sketch. */
    piece?: number,
  ) => {
    const pointed = piece !== undefined && hovered?.index === piece;
    return (
      <li
        key={key}
        ref={pointed ? hoveredRow : undefined}
        onMouseEnter={piece === undefined ? undefined : () => setHovered({ index: piece, from: "list" })}
        onMouseLeave={piece === undefined ? undefined : () => setHovered(null)}
      >
        <label
          className="flex cursor-pointer items-center gap-2.5 rounded-[6px] border px-2 py-1.5"
          style={{
            borderColor: on ? "var(--emphasis)" : "var(--border)",
            // Pointed at: an unticked row firms its edge to the emphasis, while a
            // ticked row, whose edge already is, steps its fill toward the ink.
            background: on
              ? pointed
                ? "color-mix(in oklch, var(--surface-2), var(--ink-strong) 10%)"
                : "var(--surface-2)"
              : "var(--surface)",
            // Drawn inside the row, so marking it moves nothing.
            outline: pointed && !on ? "1px solid var(--emphasis)" : undefined,
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
  };
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
  const empty = !coveringKey && entries.length === 0;
  /** What a covering background or a piece shows: a picture or a colour. */
  const kindOf = (imagePath: string | null) => (imagePath ? labels.picture : labels.colour);
  const graphicKind = { text: labels.text, picture: labels.picture, fill: labels.colour, other: labels.shape } as const;
  const shareOf = (share: number) => template(labels.shareTemplate, { pct: Math.round(share * 100) });
  /** A row's name: what it shows, a background graphic marked as one. */
  const nameOf = ({ graphic, piece }: Entry) =>
    graphic ? `${graphicKind[graphic.kind]} · ${labels.graphic}` : kindOf(piece.imagePath);
  const shareOfEntry = ({ graphic, piece }: Entry) => (graphic ? graphic.place?.share : piece.share);
  const goes = ({ graphic, piece }: Entry) => (graphic ? !keptGraphics.has(graphic.key) : picked.has(piece.key));
  const toggleOf = ({ graphic, piece }: Entry) => (graphic ? () => onToggleGraphic(graphic.key) : () => onToggle(piece.key));
  const items = entries.map((e): SketchItem => {
    const shown = e.graphic ?? e.piece;
    const place = e.graphic ? e.graphic.place : { box: e.piece.box, rotation: e.piece.rotation };
    const share = shareOfEntry(e);
    return {
      imagePath: shown.imagePath,
      swatch: shown.swatch,
      box: place?.box ?? null,
      rotation: place?.rotation ?? 0,
      removed: goes(e),
      underCovering: e.graphic?.underCovering ?? false,
      name: share === undefined ? nameOf(e) : `${nameOf(e)} · ${shareOf(share)}`,
      toggle: toggleOf(e),
    };
  });
  /** An entry's row; by its place in the stack, since a slide may show the same piece twice (one picture placed twice). */
  const entryRow = (e: Entry, i: number) => {
    const shown = e.graphic ?? e.piece;
    const place = items[i].box && { box: items[i].box, rotation: items[i].rotation };
    const share = shareOfEntry(e);
    return row(
      `${slide?.slideIndex}:${i}`,
      goes(e),
      toggleOf(e),
      thumb(shown.imagePath ? urls.get(shown.imagePath) : null, shown.swatch, "contain"),
      <MiniMap box={place?.box ?? null} rotation={place?.rotation ?? 0} aspect={aspect} />,
      nameOf(e),
      where((e.graphic ? graphicSlides : pieceSlides).get(shown.key), share === undefined ? undefined : shareOf(share)),
      i,
    );
  };
  // Nothing to skip when every slide listed has something to pick (a master
  // picture on every slide, the common case): the switch is hidden, its place kept.
  const allHaveElements = slides.every(hasElements);
  /** A switch over the pager's slides; a hidden one keeps its place, so nothing moves. */
  const switchBox = (label: string, on: boolean, set: (next: boolean) => void, hidden = false, disabled = false) => (
    <label
      className={`flex items-center gap-1.5 font-body text-[11px] ${hidden ? "invisible" : ""} ${disabled ? "" : "cursor-pointer"}`}
      style={{ color: disabled ? "var(--ink-soft)" : "var(--ink-strong)" }}
    >
      <input
        type="checkbox"
        className="size-3.5 shrink-0"
        checked={on && !disabled}
        disabled={hidden || disabled}
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
          {/* The number on the left, the arrows together on the right: a mark
              after the number only grows to its right, so nothing moves. */}
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-body text-[11.5px] tabular-nums" style={{ color: "var(--ink-strong)" }}>
              {template(labels.slideTemplate, { n: slide?.slideIndex ?? 0, total: totalSlides })}
              {slide && !inScope.has(slide.slideIndex) && (
                <span style={{ color: "var(--ink-soft)" }}>{` · ${labels.outOfScope}`}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => page(-1)}
              aria-label={labels.previous}
              disabled={paged.length < 2}
              className="subtle-action flex size-6 shrink-0 items-center justify-center rounded-[5px] font-body text-[12px]"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => page(1)}
              aria-label={labels.next}
              disabled={paged.length < 2}
              className="subtle-action flex size-6 shrink-0 items-center justify-center rounded-[5px] font-body text-[12px]"
            >
              ›
            </button>
          </div>
          {/* The scope switch first: it is always there, the other may be hidden. */}
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
            {switchBox(labels.onlyInScope, onlyInScope, setOnlyInScope)}
            {switchBox(labels.onlyWithElements, onlyWithElements, setOnlyWithElements, allHaveElements)}
            {switchBox(labels.newView, resultView, setResultView, false, newBackground === null)}
          </div>
          <SlideSketch
            background={background}
            covering={coveringKey !== undefined}
            newBackground={resultView ? newBackground : null}
            coveringKept={coveringKey !== undefined && kept.has(coveringKey)}
            items={items}
            urls={urls}
            hovered={hovered?.index ?? null}
            // Leaving a piece here (or its focus moving to the list) clears
            // only what the sketch marked, never the row the pointer is on.
            onHover={(i) =>
              setHovered((prev) => (i !== null ? { index: i, from: "sketch" } : prev?.from === "sketch" ? null : prev))
            }
            ratio={ratio}
          />
        </div>

        {/* Right: the slide's covering background, background graphics and pieces, bottom of the stack first. */}
        <ul className="flex min-h-0 flex-col gap-1.5 overflow-y-auto pr-1">
          {empty && (
            <li className="py-6 text-center font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
              {labels.empty}
            </li>
          )}
          {/* The background graphics under the covering background, then it, then the rest. */}
          {entries.map((e, i) => (e.graphic?.underCovering ? entryRow(e, i) : null))}
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
              COVERING_ROW,
            )}
          {entries.map((e, i) => (e.graphic?.underCovering ? null : entryRow(e, i)))}
        </ul>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t pt-2" style={{ borderColor: "var(--hairline)" }}>
        {/* Two lines always reserved, the picks at the bottom: the graphics' line comes and goes without moving anything. */}
        <span
          className="flex min-h-[2.7em] min-w-0 flex-1 flex-col justify-end font-body text-[11px] leading-[1.35]"
          style={{ color: "var(--ink-soft)" }}
        >
          {graphicsGoing > 0 && <span className="truncate">{template(labels.graphicsSummaryTemplate, { n: graphicsGoing })}</span>}
          <span className="truncate">{template(labels.pickedTemplate, { n: pickedInScope })}</span>
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
