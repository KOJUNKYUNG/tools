"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { standInRect } from "@/lib/image/cropFrameView";
import type { CropRect, ImageDims } from "@/lib/image/maxFitCrop";

/** A canvas drawn elsewhere (a live preview), and how many times it has been drawn. */
export interface LivePicture {
  canvas: HTMLCanvasElement;
  /** Changes on each drawing, so every copy takes the canvas again. */
  version: number;
}

interface LiveCanvasProps {
  live: LivePicture;
  /** The part to show, in `sourceSize` pixels; without one, the centred part covering the box. */
  crop?: CropRect | null;
  /** The size of the picture `crop` is held in, of which the live canvas is a smaller stand-in. */
  sourceSize: ImageDims;
  className?: string;
}

/** The screen's device pixel ratio, followed as it changes (another monitor, a browser zoom). */
function useDevicePixelRatio(): number {
  const [ratio, setRatio] = useState(() => (typeof window === "undefined" ? 1 : devicePixelRatio));
  useEffect(() => {
    // A media query on the current ratio fires once it no longer holds.
    const query = matchMedia(`(resolution: ${ratio}dppx)`);
    const change = () => setRatio(devicePixelRatio);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, [ratio]);
  return ratio;
}

/**
 * A copy of a live canvas (or of the part inside `crop`) at this element's
 * size: a GPU copy on each drawing, with no picture file in between, so it
 * follows the source as fast as it is drawn. Laid over the picture it stands
 * in for, which keeps the layout and the accessible name.
 */
export function LiveCanvas({ live, crop = null, sourceSize, className }: LiveCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  /** Bumped when the element is resized, to copy again at the new size. */
  const [resized, setResized] = useState(0);
  const ratio = useDevicePixelRatio();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setResized((n) => n + 1));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const { canvas, version } = live;
  const { w: sourceW, h: sourceH } = sourceSize;
  // Drawn before paint, at the element's size read now, so a new copy (or a
  // newly shown one) never shows a frame late.
  useLayoutEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || el.clientWidth <= 0 || el.clientHeight <= 0) return;
    const w = Math.round(el.clientWidth * ratio);
    const h = Math.round(el.clientHeight * ratio);
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
    }
    const source = { w: sourceW, h: sourceH };
    const part = standInRect(crop, source, { w: canvas.width, h: canvas.height }, el.clientWidth / el.clientHeight);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, part.x, part.y, part.w, part.h, 0, 0, w, h);
  }, [canvas, version, crop, sourceW, sourceH, ratio, resized]);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
