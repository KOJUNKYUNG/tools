"use client";
import { useCallback, useRef, useState, type PointerEvent as RPE, type CSSProperties } from "react";
import type { Box } from "@/lib/pptx/slidePlacement";

type Handle = "nw" | "ne" | "se" | "sw" | "n" | "e" | "s" | "w";

interface PlacementEditorProps {
  box: Box;
  onBoxChange: (box: Box) => void;
  slideAspect: number; // w/h
  background: { kind: "color"; color: string } | { kind: "image"; url: string };
  refImageUrl: string | null;
}

function clamp01Box(b: Box): Box {
  const w = Math.max(0.02, Math.min(1, b.w));
  const h = Math.max(0.02, Math.min(1, b.h));
  const x = Math.max(0, Math.min(b.x, 1 - w));
  const y = Math.max(0, Math.min(b.y, 1 - h));
  return { x, y, w, h };
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
      const dx = (e.clientX - drag.current.px) / r.width;
      const dy = (e.clientY - drag.current.py) / r.height;
      const b = { ...drag.current.box };
      if (mode === "move") { b.x += dx; b.y += dy; }
      else {
        if (mode.includes("w")) { b.x += dx; b.w -= dx; }
        if (mode.includes("n")) { b.y += dy; b.h -= dy; }
        if (mode.includes("e")) { b.w += dx; }
        if (mode.includes("s")) { b.h += dy; }
      }
      props.onBoxChange(clamp01Box(b));
    },
    [mode, props],
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
      style={{ paddingTop: `${100 / props.slideAspect}%`, ...bg }}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      <div
        className="absolute cursor-move border-2"
        style={{
          left: `${props.box.x * 100}%`, top: `${props.box.y * 100}%`,
          width: `${props.box.w * 100}%`, height: `${props.box.h * 100}%`,
          borderColor: "var(--accent-electric)",
        }}
        onPointerDown={onMoveDown}
      >
        {props.refImageUrl && (
          <img src={props.refImageUrl} alt="" draggable={false}
            className="pointer-events-none absolute left-0 top-0 h-full w-full object-contain object-left-top" />
        )}
        {(["nw","n","ne","e","se","s","sw","w"] as Handle[]).map((h) => (
          <div key={h} role="button" aria-label={`resize ${h}`}
            onPointerDown={(e) => onHandleDown(e, h)}
            className="absolute size-3 rounded-sm border-2 bg-white"
            style={{ borderColor: "var(--accent-electric)", ...HANDLE_POS[h], touchAction: "none" }} />
        ))}
      </div>
    </div>
  );
}
