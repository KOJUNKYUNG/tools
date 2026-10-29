"use client";

import { useEffect, useRef, useState } from "react";
import { bakeFilters } from "@/lib/image/filterCanvas";
import { isFiltered, type BackgroundKind, type FilterSet } from "@/lib/image/filterSet";
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
}

/**
 * The selected-background preview with the filter set baked in: the cropped
 * picture (or the recipe edit's live drawing) drawn at preview size and
 * filtered by the same code as the applied picture, on a canvas copied as
 * the recipe edit's is. It redraws on each change, at most once a frame.
 * Null while nothing is filtered (the picture shows as it is) or the
 * picture is not loaded yet.
 */
export function useFilterPreview({
  filters,
  kind,
  imageUrl,
  recipeLive,
  crop,
  sourceSize,
  ratio,
}: FilterPreviewInput): LivePicture | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [image, setImage] = useState<{ url: string; img: HTMLImageElement } | null>(null);
  /** The latest drawing, and the picture it was drawn from. */
  const [drawn, setDrawn] = useState<{ live: LivePicture; url: string } | null>(null);
  const filtered = isFiltered(filters, kind);

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
      const canvas = (canvasRef.current ??= document.createElement("canvas"));
      canvas.width = Math.max(1, Math.round(part.w * scale));
      canvas.height = Math.max(1, Math.round(part.h * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(picture, part.x, part.y, part.w, part.h, 0, 0, canvas.width, canvas.height);
      bakeFilters(canvas, filters, kind);
      // A new version tells each copy to take the canvas again.
      setDrawn((prev) => ({ live: { canvas, version: (prev?.live.version ?? 0) + 1 }, url }));
    });
    return () => cancelAnimationFrame(frame);
  }, [filtered, filters, kind, imageUrl, loaded, recipeLive, crop, sourceW, sourceH, ratio]);

  // A drawing of the last picture never shows over a new one.
  return filtered && drawn && drawn.url === imageUrl ? drawn.live : null;
}
