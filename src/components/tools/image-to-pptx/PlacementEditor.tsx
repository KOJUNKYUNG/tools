"use client";
import { useCallback, useRef, useState, type PointerEvent as RPE, type CSSProperties } from "react";
import {
  clampBox,
  placementPercents,
  resizeBox,
  setPlacementField,
  type Box,
  type FillSize,
  type PlacementAlign,
  type ResizeHandle,
} from "@/lib/pptx/slidePlacement";
import { ZoomButton } from "@/components/common/ZoomButton";
import { BackgroundFill, type ShownBackground } from "./BackgroundFill";
import type { PlacementGuide } from "./PlacementControls";

type Handle = ResizeHandle;
const HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

interface PlacementEditorProps {
  box: Box;
  onBoxChange: (box: Box) => void;
  slideW: number; // inches
  slideH: number; // inches
  /** The deck's background, cut to its crop as the deck will hold it. */
  background: ShownBackground;
  refImageUrl: string | null;
  align: PlacementAlign;
  /** Accessible name of each resize handle. */
  handleLabels: Record<Handle, string>;
  /** The zoom button's name, and what it opens (the preview enlarged); no button without them. */
  zoom?: { label: string; onZoom: () => void };
  /** The fill size (inches): the first picture as large as fits the slide; null before it loads. */
  fill: FillSize | null;
  /** Whether the first picture reaches past the slide, so the deck will cut it. */
  cut: boolean;
  /** The line held under the preview, shown while `cut`. */
  cutNotice: string;
  /** Width and height locked to the first picture's shape: a resize keeps it. */
  lock: boolean;
  /** What the focused placement field asks to see drawn; null when none is focused. A drag adds its own. */
  guide: PlacementGuide;
}

/** The band (px) drawn around the slide, where the part past its edge shows faded. */
const OUTSIDE_PX = 14;

/** The placement box's position and size on the slide, as shares of it. */
export function boxStyle(box: Box, slideW: number, slideH: number): CSSProperties {
  return {
    left: `${(box.x / slideW) * 100}%`,
    top: `${(box.y / slideH) * 100}%`,
    width: `${(box.w / slideW) * 100}%`,
    height: `${(box.h / slideH) * 100}%`,
  };
}

/** The first slide picture fitted in the placement box by the alignment, as the deck places it. */
export function PlacedPicture({ url, align }: { url: string; align: PlacementAlign }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      draggable={false}
      className={`pointer-events-none absolute left-0 top-0 h-full w-full object-contain ${align === "center" ? "object-center" : "object-left-top"}`}
    />
  );
}


// The guides sit over any background: black on a white halo, as the handles.
const GUIDE_LINE: CSSProperties = { background: "var(--mono-1000)", boxShadow: "0 0 0 1px var(--mono-0)" };
const GUIDE_TAG =
  "absolute whitespace-nowrap rounded-[2px] px-1 font-body text-[10px] leading-4 tabular-nums";
const GUIDE_TAG_STYLE: CSSProperties = { background: "var(--mono-1000)", color: "var(--mono-0)" };

const clampTo = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * A position's distance on the preview: a line from the slide's edge to the
 * box's edge along `axis`, through the box's middle, with the value the field
 * reads. Past the edge (negative) the line runs outward and the value sits at
 * the slide's edge, where it can be read.
 */
function DistanceGuide({ axis, box, slideW, slideH }: { axis: "x" | "y"; box: Box; slideW: number; slideH: number }) {
  const pct = placementPercents(box, slideW, slideH);
  const across = axis === "x";
  const value = across ? pct.x : pct.y;
  // The box's middle on the other axis, as a share of the slide, held on it.
  const middle = clampTo(across ? ((box.y + box.h / 2) / slideH) * 100 : ((box.x + box.w / 2) / slideW) * 100, 0, 100);
  const lo = Math.min(0, value);
  const len = Math.abs(value);
  const inside = value > 0;
  const tagAt = inside ? lo + len / 2 : 0;
  const line: CSSProperties = across
    ? { left: `${lo}%`, width: `${len}%`, top: `${middle}%`, height: 2, transform: "translateY(-50%)" }
    : { top: `${lo}%`, height: `${len}%`, left: `${middle}%`, width: 2, transform: "translateX(-50%)" };
  const tag: CSSProperties = across
    ? { left: `${tagAt}%`, top: `${middle}%`, transform: `translate(${inside ? "-50%" : "2px"}, calc(-100% - 3px))` }
    : { top: `${tagAt}%`, left: `${middle}%`, transform: `translate(4px, ${inside ? "-50%" : "2px"})` };
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className="absolute" style={{ ...GUIDE_LINE, ...line }} />
      <span className={GUIDE_TAG} style={{ ...GUIDE_TAG_STYLE, ...tag }}>
        {Math.round(value)}%
      </span>
    </div>
  );
}

/** One guide drawn on the preview: a position's distance, or the 100% size. */
type GuideKind = Exclude<PlacementGuide, null>;

/**
 * The guides on the preview: a position's distance, or the 100% size outlined
 * where typing 100 would put the box. While a resize handle is dragged, the
 * box's own size reads on it (`sizeTag`).
 */
function Guides({ guides, sizeTag, box, slideW, slideH, fill }: {
  guides: readonly GuideKind[]; sizeTag: string | null; box: Box; slideW: number; slideH: number; fill: FillSize | null;
}) {
  const full = guides.includes("size") ? setPlacementField(box, "size", 100, { slideW, slideH, fill, lock: true }) : null;
  // The box's top-left, held on the slide so its size reads past the edge too.
  const tagAt: CSSProperties = {
    left: `clamp(4px, ${(box.x / slideW) * 100}% + 4px, calc(100% - 84px))`,
    top: `clamp(4px, ${(box.y / slideH) * 100}% + 4px, calc(100% - 20px))`,
  };
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {guides.includes("x") && <DistanceGuide axis="x" box={box} slideW={slideW} slideH={slideH} />}
      {guides.includes("y") && <DistanceGuide axis="y" box={box} slideW={slideW} slideH={slideH} />}
      {full && (
        <div
          className="absolute"
          style={{
            ...boxStyle(full, slideW, slideH),
            outline: "2px dashed var(--mono-1000)",
            outlineOffset: "-1px",
            boxShadow: "inset 0 0 0 3px var(--mono-0)",
          }}
        >
          <span className={GUIDE_TAG} style={{ ...GUIDE_TAG_STYLE, left: 4, top: 4 }}>100%</span>
        </div>
      )}
      {sizeTag && (
        <span className={GUIDE_TAG} style={{ ...GUIDE_TAG_STYLE, ...tagAt }}>{sizeTag}</span>
      )}
    </div>
  );
}

/**
 * What the preview draws: a drag's own guides (both distances while the box
 * moves; the 100% size and the box's size while a handle resizes it), with
 * the focused field's guide.
 */
function guidesFor(mode: null | "move" | Handle, focused: PlacementGuide): GuideKind[] {
  const shown = new Set<GuideKind>(focused ? [focused] : []);
  if (mode === "move") {
    shown.add("x");
    shown.add("y");
  } else if (mode) shown.add("size");
  return [...shown];
}

/** The box's size as the fields read it: one share locked, width × height unlocked. */
function sizeLabel(box: Box, slideW: number, slideH: number, fill: FillSize | null, lock: boolean): string {
  const pct = placementPercents(box, slideW, slideH, fill);
  return lock ? `${Math.round(pct.w)}%` : `${Math.round(pct.w)}% × ${Math.round(pct.h)}%`;
}

/** Half a handle's 12 px side. */
const HANDLE_HALF_PX = 6;

/**
 * A handle's place on the slide: on the box's edge or corner, held inside the
 * band around the slide, so it can still be grabbed when the box reaches far
 * past the slide. A drag moves the box's own edge, wherever the handle sits.
 */
function handleStyle(h: Handle, box: Box, slideW: number, slideH: number): CSSProperties {
  const along = (lo: number, len: number, low: boolean, high: boolean) => (low ? lo : high ? lo + len : lo + len / 2);
  const xPct = (along(box.x, box.w, h.includes("w"), h.includes("e")) / slideW) * 100;
  const yPct = (along(box.y, box.h, h.includes("n"), h.includes("s")) / slideH) * 100;
  const reach = OUTSIDE_PX - HANDLE_HALF_PX;
  const held = (pct: number) => `clamp(${-reach}px, ${pct}%, calc(100% + ${reach}px))`;
  return { left: held(xPct), top: held(yPct), transform: "translate(-50%, -50%)" };
}

export function PlacementEditor(props: PlacementEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ px: 0, py: 0, box: props.box });
  const [mode, setMode] = useState<null | "move" | Handle>(null);

  const { slideW, slideH, onBoxChange, fill, lock } = props;

  const onMoveDown = (e: RPE<HTMLDivElement>) => {
    e.preventDefault();
    setMode("move");
    drag.current = { px: e.clientX, py: e.clientY, box: props.box };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleDown = (e: RPE<HTMLDivElement>, h: Handle) => {
    e.preventDefault();
    e.stopPropagation();
    setMode(h);
    drag.current = { px: e.clientX, py: e.clientY, box: props.box };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = useCallback(
    // eslint-disable-next-line react-hooks/preserve-manual-memoization -- reads drag/ref refs the compiler can't track; deps are hand-narrowed to the reactive inputs
    (e: RPE<HTMLDivElement>) => {
      if (!mode || !ref.current) return;
      const r = ref.current.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const dxIn = ((e.clientX - drag.current.px) / r.width) * slideW;
      const dyIn = ((e.clientY - drag.current.py) / r.height) * slideH;
      // The same placement rule as the fields: 10–300% of the fill size,
      // anywhere that keeps 5% of the slide covered.
      const start = drag.current.box;
      onBoxChange(
        mode === "move"
          ? clampBox({ ...start, x: start.x + dxIn, y: start.y + dyIn }, slideW, slideH, fill)
          : resizeBox(start, mode, dxIn, dyIn, slideW, slideH, fill, lock),
      );
    },
    [mode, slideW, slideH, onBoxChange, fill, lock],
  );
  const onUp = () => setMode(null);

  // The editor takes all the room its parent leaves it (flex-1) and draws the
  // slide as large as fits inside with a band around it, centred. Its own box
  // never depends on the slide's shape, so switching 16:9 ↔ 4:3 moves nothing
  // around it. Container units (cqw/cqh) size the slide against that box.
  const ratio = slideW / slideH;
  const band = `${OUTSIDE_PX * 2}px`;
  const boxAt = boxStyle(props.box, slideW, slideH);
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-1">
      <div
        className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
        style={{ containerType: "size" }}
      >
        <div
          ref={ref}
          className="group relative shrink-0 select-none"
          style={{
            width: `min(calc(100cqw - ${band}), calc((100cqh - ${band}) * ${ratio}))`,
            height: `min(calc(100cqh - ${band}), calc((100cqw - ${band}) / ${ratio}))`,
          }}
          onPointerMove={onMove}
          onPointerUp={onUp}
          // A drag the browser takes over (a touch pan) or loses ends here too,
          // so no guide or stale drag start stays behind.
          onPointerCancel={onUp}
          onLostPointerCapture={onUp}
        >
          {/* The picture past the slide's edge, faded: the deck cuts it off. */}
          {props.refImageUrl && (
            <div className="pointer-events-none absolute opacity-30" style={boxAt}>
              <PlacedPicture url={props.refImageUrl} align={props.align} />
            </div>
          )}
          {/* The slide itself: the background and the picture as the deck shows them. */}
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-[3px] border"
            style={{ borderColor: "var(--border)" }}
          >
            <BackgroundFill background={props.background} className="absolute inset-0 size-full" />
            {props.refImageUrl && (
              <div className="absolute" style={boxAt}>
                <PlacedPicture url={props.refImageUrl} align={props.align} />
              </div>
            )}
          </div>
          <div
            className="absolute cursor-move"
            style={{
              ...boxAt,
              // Outline (not border) so the box's content area stays exactly box.w×box.h;
              // a border would shrink the inner image area and make object-contain
              // letterbox even at 100% (preview-only artifact).
              outline: "2px solid var(--mono-1000)",
              outlineOffset: "-1px",
              // A touch drags the frame rather than panning the page.
              touchAction: "none",
            }}
            onPointerDown={onMoveDown}
          />
          <Guides
            guides={guidesFor(mode, props.guide)}
            sizeTag={mode && mode !== "move" ? sizeLabel(props.box, slideW, slideH, fill, lock) : null}
            box={props.box}
            slideW={slideW}
            slideH={slideH}
            fill={fill}
          />
          {HANDLES.map((h) => (
            <div key={h} role="button" aria-label={props.handleLabels[h]}
              onPointerDown={(e) => onHandleDown(e, h)}
              className="absolute size-3 rounded-sm border-2 bg-white"
              style={{ borderColor: "var(--mono-1000)", ...handleStyle(h, props.box, slideW, slideH), touchAction: "none" }} />
          ))}
          {props.zoom ? <ZoomButton label={props.zoom.label} onZoom={props.zoom.onZoom} /> : null}
        </div>
      </div>
      {/* Held in place, empty while nothing is cut, so nothing below it moves. */}
      <p
        className="h-4 shrink-0 truncate text-center font-body text-[11px] leading-4"
        style={{ color: "var(--ink-soft)" }}
        aria-live="polite"
      >
        {props.cut ? props.cutNotice : ""}
      </p>
    </div>
  );
}
