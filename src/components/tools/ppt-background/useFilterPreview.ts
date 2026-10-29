"use client";

import { useEffect, useRef, useState } from "react";
import { composeFilters, paperStepOf } from "@/lib/image/filterCanvas";
import { filterPlan, isFiltered, laidPaperFilter, NO_FILTERS, type BackgroundKind, type FilterSet } from "@/lib/image/filterSet";
import { drawPaperFilter } from "@/lib/image/paperFilterDrawing";
import type { PaperFilter } from "@/lib/image/paperFilters";
import { standInRect } from "@/lib/image/cropFrameView";
import type { CropRect, ImageDims } from "@/lib/image/maxFitCrop";
import type { LivePicture } from "@/components/image/LiveCanvas";

/**
 * The largest preview drawn, in the slide's orientation: Full HD, sharp in
 * the zoom yet quick to filter on each change. Strengths are shares of the
 * picture, so it looks as the 4K result does.
 */
const PREVIEW_BOX = { long: 1920, short: 1080 };

export interface FilterPreviewInput {
  filters: FilterSet;
  kind: BackgroundKind;
  /** The picked picture shown (a smaller stand-in of the source while it downloads). */
  imageUrl: string | null;
  /** The recipe edit's live drawing, which stands in for the picture while the pick is edited. */
  recipeLive: LivePicture | null;
  /** The Background crop, in `sourceSize` pixels; until it is known the picture is centred to fill. */
  crop: CropRect | null;
  /** The size `crop` is held in; defaults to the shown picture's own. */
  sourceSize?: ImageDims;
  /** The slide's width / height. */
  ratio: number;
  /** The Paper filter failed to draw; the preview stays on its last drawing. */
  onPaperFail: () => void;
}

/** The cropped picture at preview size, the input of every filter; a new version on each drawing. */
interface Base {
  canvas: HTMLCanvasElement;
  version: number;
  url: string;
}

/**
 * The selected-background preview with the filter set baked in: the cropped
 * picture (or the recipe edit's live drawing) drawn at preview size and
 * filtered by the same code as the applied picture, on a canvas copied as
 * the recipe edit's is. The Paper filter is drawn once per picture and
 * filter, one drawing at a time, and kept, so its strength and the pixel
 * filters redraw at most once a frame without drawing it again. Null while
 * nothing is filtered (the picture shows as it is) or the picture is not
 * loaded yet.
 */
export function useFilterPreview({
  filters,
  kind,
  imageUrl,
  recipeLive,
  crop,
  sourceSize,
  ratio,
  onPaperFail,
}: FilterPreviewInput): LivePicture | null {
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const outRef = useRef<HTMLCanvasElement | null>(null);
  const [image, setImage] = useState<{ url: string; img: HTMLImageElement } | null>(null);
  const [base, setBase] = useState<Base | null>(null);
  /** Paper's latest drawing, and the base and filter it was drawn for. */
  const [paperDrawn, setPaperDrawn] = useState<{
    canvas: HTMLCanvasElement;
    version: number;
    paperFilter: PaperFilter;
  } | null>(null);
  /** The latest drawing, and the picture it was drawn from. */
  const [drawn, setDrawn] = useState<{ live: LivePicture; url: string } | null>(null);
  /** Paper drawings run one after another; one whose base or filter has changed meanwhile is skipped. */
  const paperQueue = useRef<Promise<void>>(Promise.resolve());
  const onPaperFailRef = useRef(onPaperFail);
  onPaperFailRef.current = onPaperFail;
  const filtered = isFiltered(filters, kind);
  // Its drawing is kept across its strength.
  const paperFilter = laidPaperFilter(filters, kind);

  useEffect(() => {
    if (!filtered || !imageUrl) return;
    let current = true;
    const img = new Image();
    img.onload = () => {
      if (current) setImage({ url: imageUrl, img });
    };
    img.src = imageUrl;
    return () => {
      current = false;
    };
  }, [filtered, imageUrl]);

  const loaded = image?.url === imageUrl ? image.img : null;
  const sourceW = sourceSize?.w;
  const sourceH = sourceSize?.h;
  useEffect(() => {
    // The recipe edit's drawing, or the picture.
    // Each drawing of the recipe edit comes as a new `recipeLive`, on the same canvas.
    const picture = recipeLive?.canvas ?? loaded;
    const url = imageUrl;
    if (!filtered || !url || !picture) return;
    const frame = requestAnimationFrame(() => {
      // The part of the picture the crop shows.
      const own =
        picture instanceof HTMLImageElement
          ? { w: picture.naturalWidth, h: picture.naturalHeight }
          : { w: picture.width, h: picture.height };
      const source = sourceW && sourceH ? { w: sourceW, h: sourceH } : own;
      const part = standInRect(crop, source, own, ratio);
      const box = ratio >= 1 ? { w: PREVIEW_BOX.long, h: PREVIEW_BOX.short } : { w: PREVIEW_BOX.short, h: PREVIEW_BOX.long };
      // Never larger than the part itself: an enlargement only blurs.
      const scale = Math.min(1, box.w / part.w, box.h / part.h);
      const canvas = (baseRef.current ??= document.createElement("canvas"));
      canvas.width = Math.max(1, Math.round(part.w * scale));
      canvas.height = Math.max(1, Math.round(part.h * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(picture, part.x, part.y, part.w, part.h, 0, 0, canvas.width, canvas.height);
      setBase((prev) => ({ canvas, version: (prev?.version ?? 0) + 1, url }));
    });
    return () => cancelAnimationFrame(frame);
  }, [filtered, imageUrl, loaded, recipeLive, crop, sourceW, sourceH, ratio]);

  useEffect(() => {
    if (!base || !paperFilter) return;
    let current = true;
    paperQueue.current = paperQueue.current.then(async () => {
      if (!current) return;
      const { width, height } = base.canvas;
      // At full strength: the strength is laid when the drawing is.
      const paperStep = paperStepOf(filterPlan({ ...NO_FILTERS, paper: paperFilter }, kind, { width, height }));
      if (!paperStep) return;
      try {
        const canvas = await drawPaperFilter(base.canvas, paperStep);
        if (current) setPaperDrawn({ canvas, version: base.version, paperFilter });
      } catch (err) {
        console.error("Paper filter preview failed to draw", err);
        if (current) onPaperFailRef.current();
      }
    });
    return () => {
      current = false;
    };
  }, [base, paperFilter, kind]);

  useEffect(() => {
    if (!filtered || !base) return;
    const { width, height } = base.canvas;
    const plan = filterPlan(filters, kind, { width, height });
    const paperStep = paperStepOf(plan);
    const paperCanvas =
      paperStep && paperDrawn?.version === base.version && paperDrawn.paperFilter === paperStep.paper
        ? paperDrawn.canvas
        : undefined;
    // Until Paper's drawing of this picture is in, the last preview stays.
    if (paperStep && !paperCanvas) return;
    const frame = requestAnimationFrame(() => {
      const canvas = (outRef.current ??= document.createElement("canvas"));
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(base.canvas, 0, 0);
      composeFilters(canvas, plan, paperCanvas);
      // A new version tells each copy to take the canvas again.
      setDrawn((prev) => ({ live: { canvas, version: (prev?.live.version ?? 0) + 1 }, url: base.url }));
    });
    return () => cancelAnimationFrame(frame);
  }, [filtered, filters, kind, base, paperDrawn]);

  // A drawing of the last picture never shows over a new one.
  return filtered && drawn && drawn.url === imageUrl ? drawn.live : null;
}
