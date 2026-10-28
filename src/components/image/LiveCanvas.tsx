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

/**
 * A copy of a live canvas (or of the part inside `crop`) at this element's
 * size: a GPU copy on each drawing, with no picture file in between, so it
 * follows the source as fast as it is drawn. Laid over the picture it stands
 * in for, which keeps the layout and the accessible name.
 */
export function LiveCanvas({ live, crop = null, sourceSize, className }: LiveCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState<ImageDims>({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Drawn before paint, so a new version never shows a frame late.
  useLayoutEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || box.w <= 0 || box.h <= 0) return;
    const w = Math.round(box.w * devicePixelRatio);
    const h = Math.round(box.h * devicePixelRatio);
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
    }
    const { canvas } = live;
    const part = standInRect(crop, sourceSize, { w: canvas.width, h: canvas.height }, box.w / box.h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, part.x, part.y, part.w, part.h, 0, 0, w, h);
  }, [live, crop, sourceSize, box]);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
