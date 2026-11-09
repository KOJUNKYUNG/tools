"use client";
import { useCallback, useRef, useState, type PointerEvent as RPE, type CSSProperties } from "react";
import { clampBox, resizeBox, type Box, type PlacementAlign, type ResizeHandle } from "@/lib/pptx/slidePlacement";
import { ZoomButton } from "@/components/common/ZoomButton";
import { BackgroundFill, type ShownBackground } from "./BackgroundFill";

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
  fill: { w: number; h: number } | null;
  /** Whether the first picture reaches past the slide, so the deck will cut it. */
  cut: boolean;
  /** The line held under the preview, shown while `cut`. */
  cutNotice: string;
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

  const { slideW, slideH, onBoxChange, fill } = props;

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
      // covering the slide on an axis where larger, inside it where smaller.
      const start = drag.current.box;
      onBoxChange(
        mode === "move"
          ? clampBox({ ...start, x: start.x + dxIn, y: start.y + dyIn }, slideW, slideH, fill)
          : resizeBox(start, mode, dxIn, dyIn, slideW, slideH, fill),
      );
    },
    [mode, slideW, slideH, onBoxChange, fill],
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
            }}
            onPointerDown={onMoveDown}
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
