"use client";

import { useEffect, useRef, useState } from "react";
import { adjustFilters, composeFilters, paperStepOf } from "@/lib/image/filterCanvas";
import { bakesPicture, filterPlan, paperDrawingKey, type BackgroundKind, type FilterSet } from "@/lib/image/filterSet";
import { drawPaperFilter } from "@/lib/image/paperFilterDrawing";
import { filledSize, fittedSize, type PixelSize } from "@/lib/image/slideImage";
import { standInRect } from "@/lib/image/cropFrameView";
import { maxFitCrop, type CropRect, type ImageDims } from "@/lib/image/maxFitCrop";
import { drawScaledDown } from "@/lib/image/downscale";
import type { LivePicture } from "@/components/image/LiveCanvas";

/**
 * The largest preview drawn, in the slide's orientation: Full HD, sharp in
 * the zoom yet quick to filter on each change. Strengths are shares of the
 * picture, so it looks as the 4K result does.
 */
const PREVIEW_BOX = { long: 1920, short: 1080 };

/** The preview box in the orientation of a slide of `ratio` (width / height). */
function previewBox(ratio: number): ImageDims {
  return ratio >= 1 ? { w: PREVIEW_BOX.long, h: PREVIEW_BOX.short } : { w: PREVIEW_BOX.short, h: PREVIEW_BOX.long };
}

export interface FilterPreviewInput {
  filters: FilterSet;
  kind: BackgroundKind;
  /** The picked picture shown (a smaller stand-in of the source while it downloads). */
  imageUrl: string | null;
  /** The picked solid colour (CSS), which stands in for a picture: the colour at the slide's aspect. */
  colour?: string | null;
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
  /** The size the applied picture of this crop (or colour) is stored at (fitted inside 4K). */
  applied: PixelSize;
}

/**
 * The selected-background preview with the filter set baked in: the cropped
 * picture (or the recipe edit's live drawing, or a solid colour) drawn at preview size and
 * filtered by the same code as the applied picture, on a canvas copied as
 * the recipe edit's is. The Paper filter is drawn from the adjusted
 * picture once per picture, filter, settings and adjustments, one drawing at
 * a time, and kept, so its strength, the overlays and grain redraw at most
 * once a frame without drawing it again. It is drawn at the applied
 * picture's size and scaled down: a halftone's dots drawn at preview size
 * come out coarser than the applied picture's. Null while the filters make
 * no picture (the picture shows as it is, a solid colour as its fill) or
 * the picture is not loaded yet.
 */
export function useFilterPreview({
  filters,
  kind,
  imageUrl,
  colour = null,
  recipeLive,
  crop,
  sourceSize,
  ratio,
  onPaperFail,
}: FilterPreviewInput): LivePicture | null {
  // What is shown, by which a drawing is matched to it: the colour, or the picture's URL.
  const shown = colour ? `colour:${colour}` : imageUrl;
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const outRef = useRef<HTMLCanvasElement | null>(null);
  const [image, setImage] = useState<{ url: string; img: HTMLImageElement } | null>(null);
  const [base, setBase] = useState<Base | null>(null);
  /** Paper's latest drawing, the adjusted picture it was drawn from, and the base and key it was drawn for. */
  const [paperDrawn, setPaperDrawn] = useState<{
    canvas: HTMLCanvasElement;
    adjusted: HTMLCanvasElement;
    version: number;
    key: string;
  } | null>(null);
  /** The latest drawing, and the picture it was drawn from. */
  const [drawn, setDrawn] = useState<{ live: LivePicture; url: string } | null>(null);
  /** Paper drawings run one after another; one whose base or filter has changed meanwhile is skipped. */
  const paperQueue = useRef<Promise<void>>(Promise.resolve());
  const onPaperFailRef = useRef(onPaperFail);
  onPaperFailRef.current = onPaperFail;
  // The filters as they are when a queued drawing starts.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const filtered = bakesPicture(filters, kind);
  // Its drawing is kept across what is laid after it.
  const paperKey = paperDrawingKey(filters, kind);

  useEffect(() => {
    if (!filtered || colour || !imageUrl) return;
    let current = true;
    const img = new Image();
    img.onload = () => {
      if (current) setImage({ url: imageUrl, img });
    };
    img.src = imageUrl;
    return () => {
      current = false;
    };
  }, [filtered, colour, imageUrl]);

  const loaded = image?.url === imageUrl ? image.img : null;
  const sourceW = sourceSize?.w;
  const sourceH = sourceSize?.h;
  useEffect(() => {
    if (!filtered || !colour || !shown) return;
    const url = shown;
    const frame = requestAnimationFrame(() => {
      // The colour at the size its picture is applied at, scaled into the preview box.
      const applied = filledSize({ w: ratio, h: 1 });
      const box = previewBox(ratio);
      const scale = Math.min(1, box.w / applied.width, box.h / applied.height);
      const canvas = (baseRef.current ??= document.createElement("canvas"));
      canvas.width = Math.max(1, Math.round(applied.width * scale));
      canvas.height = Math.max(1, Math.round(applied.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      setBase((prev) => ({ canvas, version: (prev?.version ?? 0) + 1, url, applied }));
    });
    return () => cancelAnimationFrame(frame);
  }, [filtered, colour, shown, ratio]);

  useEffect(() => {
    // The recipe edit's drawing, or the picture.
    // Each drawing of the recipe edit comes as a new `recipeLive`, on the same canvas.
    const picture = recipeLive?.canvas ?? loaded;
    const url = imageUrl;
    if (!filtered || colour || !url || !picture) return;
    const frame = requestAnimationFrame(() => {
      // The part of the picture the crop shows.
      const own =
        picture instanceof HTMLImageElement
          ? { w: picture.naturalWidth, h: picture.naturalHeight }
          : { w: picture.width, h: picture.height };
      const source = sourceW && sourceH ? { w: sourceW, h: sourceH } : own;
      const part = standInRect(crop, source, own, ratio);
      // The size the applied picture is stored at, from the crop the run
      // takes (centred to fill until one is set); both read only the slide's aspect.
      const applied = fittedSize(crop ?? maxFitCrop(source, ratio, 1), { w: ratio, h: 1 });
      const box = previewBox(ratio);
      // Never larger than the part itself: an enlargement only blurs.
      const scale = Math.min(1, box.w / part.w, box.h / part.h);
      const canvas = (baseRef.current ??= document.createElement("canvas"));
      canvas.width = Math.max(1, Math.round(part.w * scale));
      canvas.height = Math.max(1, Math.round(part.h * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // In halving steps, as the applied picture's fit: fine detail does not turn to noise.
      drawScaledDown(ctx, picture, part, canvas.width, canvas.height);
      setBase((prev) => ({ canvas, version: (prev?.version ?? 0) + 1, url, applied }));
    });
    return () => cancelAnimationFrame(frame);
  }, [filtered, colour, imageUrl, loaded, recipeLive, crop, sourceW, sourceH, ratio]);

  useEffect(() => {
    if (!base || !paperKey) return;
    let current = true;
    paperQueue.current = paperQueue.current.then(async () => {
      if (!current) return;
      const set = filtersRef.current;
      // The adjustments at preview size, the picture the filter is drawn from.
      const { width, height } = base.canvas;
      const adjusted = document.createElement("canvas");
      adjusted.width = width;
      adjusted.height = height;
      const ctx = adjusted.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(base.canvas, 0, 0);
      adjustFilters(adjusted, filterPlan(set, kind, { width, height }));
      // Planned for the applied size, so its dots are the applied picture's.
      const paperStep = paperStepOf(filterPlan(set, kind, base.applied));
      if (!paperStep) return;
      try {
        const canvas = await drawPaperFilter(adjusted, paperStep);
        if (current) setPaperDrawn({ canvas, adjusted, version: base.version, key: paperKey });
      } catch (err) {
        console.error("Paper filter preview failed to draw", err);
        if (current) onPaperFailRef.current();
      }
    });
    return () => {
      current = false;
    };
  }, [base, paperKey, kind]);

  useEffect(() => {
    if (!filtered || !base) return;
    const { width, height } = base.canvas;
    const plan = filterPlan(filters, kind, { width, height });
    const paperStep = paperStepOf(plan);
    const paper = paperStep && paperDrawn?.version === base.version && paperDrawn.key === paperKey ? paperDrawn : undefined;
    // Until Paper's drawing of this picture is in, the last preview stays.
    if (paperStep && !paper) return;
    const frame = requestAnimationFrame(() => {
      const canvas = (outRef.current ??= document.createElement("canvas"));
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      // The adjusted picture the drawing was made from, or the picture, every step still to come.
      ctx.drawImage(paper?.adjusted ?? base.canvas, 0, 0);
      composeFilters(canvas, plan, paper?.canvas);
      // A new version tells each copy to take the canvas again.
      setDrawn((prev) => ({ live: { canvas, version: (prev?.live.version ?? 0) + 1 }, url: base.url }));
    });
    return () => cancelAnimationFrame(frame);
  }, [filtered, filters, kind, base, paperDrawn, paperKey]);

  // A drawing of the last picture never shows over a new one.
  return filtered && drawn && drawn.url === shown ? drawn.live : null;
}
