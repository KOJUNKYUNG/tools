"use client";
import { useCallback, useRef, useState, type PointerEvent as RPE, type CSSProperties } from "react";
import { clampBox, type Box, type PlacementAlign } from "@/lib/pptx/slidePlacement";

type Handle = "nw" | "ne" | "se" | "sw" | "n" | "e" | "s" | "w";

interface PlacementEditorProps {
  box: Box;
  onBoxChange: (box: Box) => void;
  slideW: number; // inches
  slideH: number; // inches
  background: { kind: "color"; color: string } | { kind: "image"; url: string };
  refImageUrl: string | null;
  align: PlacementAlign;
}


const HANDLE_POS: Record<Handle, CSSProperties> = {
  nw: { top: -6, left: -6 }, n: { top: -6, left: "calc(50% - 6px)" },
  ne: { top: -6, right: -6 }, e: { top: "calc(50% - 6px)", right: -6 },
  se: { bottom: -6, right: -6 }, s: { bottom: -6, left: "calc(50% - 6px)" },
  sw: { bottom: -6, left: -6 }, w: { top: "calc(50% - 6px)", left: -6 },
};

export function PlacementEditor(props: PlacementEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ px: 0, py: 0, box: props.box });
  const [mode, setMode] = useState<null | "move" | Handle>(null);

  const { slideW, slideH } = props;

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
    (e: RPE<HTMLDivElement>) => {
      if (!mode || !ref.current) return;
      const r = ref.current.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const dxIn = ((e.clientX - drag.current.px) / r.width) * slideW;
      const dyIn = ((e.clientY - drag.current.py) / r.height) * slideH;
      const b = { ...drag.current.box };
      if (mode === "move") { b.x += dxIn; b.y += dyIn; }
      else {
        if (mode.includes("w")) { b.x += dxIn; b.w -= dxIn; }
        if (mode.includes("n")) { b.y += dyIn; b.h -= dyIn; }
        if (mode.includes("e")) { b.w += dxIn; }
        if (mode.includes("s")) { b.h += dyIn; }
      }
      props.onBoxChange(clampBox(b, slideW, slideH));
    },
    [mode, props, slideW, slideH],
  );
  const onUp = () => setMode(null);

  const bg: CSSProperties =
    props.background.kind === "color"
      ? { background: props.background.color }
      : { backgroundImage: `url(${props.background.url})`, backgroundSize: "cover", backgroundPosition: "center" };

  return (
    <div
      ref={ref}
      className="relative w-full select-none overflow-hidden rounded-lg border"
      style={{ paddingTop: `${(slideH / slideW) * 100}%`, ...bg }}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      <div
        className="absolute cursor-move"
        style={{
          left: `${(props.box.x / slideW) * 100}%`,
          top: `${(props.box.y / slideH) * 100}%`,
          width: `${(props.box.w / slideW) * 100}%`,
          height: `${(props.box.h / slideH) * 100}%`,
          // Outline (not border) so the box's content area stays exactly box.w×box.h;
          // a border would shrink the inner image area and make object-contain
          // letterbox even at 100% (preview-only artifact).
          outline: "2px solid var(--mono-1000)",
          outlineOffset: "-1px",
        }}
        onPointerDown={onMoveDown}
      >
        {props.refImageUrl && (
          <img src={props.refImageUrl} alt="" draggable={false}
            className={`pointer-events-none absolute left-0 top-0 h-full w-full object-contain ${props.align === "center" ? "object-center" : "object-left-top"}`} />
        )}
        {(["nw","n","ne","e","se","s","sw","w"] as Handle[]).map((h) => (
          <div key={h} role="button" aria-label={`resize ${h}`}
            onPointerDown={(e) => onHandleDown(e, h)}
            className="absolute size-3 rounded-sm border-2 bg-white"
            style={{ borderColor: "var(--mono-1000)", ...HANDLE_POS[h], touchAction: "none" }} />
        ))}
      </div>
    </div>
  );
}
