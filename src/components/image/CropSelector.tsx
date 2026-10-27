"use client";

import type * as React from "react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { EMPTY_BOX, containBox, frameInBox, pointInSource, type Box } from "@/lib/image/cropFrameView";
import { cropFits, maxFitCrop, type CropRect, type ImageDims } from "@/lib/image/maxFitCrop";
import {
  aspectLockedResize,
  type ResizeHandle,
} from "@/lib/image/aspectLockedResize";

// Single-source the CropRect type from the lib; re-export so existing
// consumers importing it from this component keep working.
export type { CropRect } from "@/lib/image/maxFitCrop";

const HANDLE_POSITIONS: Record<ResizeHandle, React.CSSProperties> = {
  nw: { top: -6, left: -6 },
  n: { top: -6, left: "calc(50% - 6px)" },
  ne: { top: -6, right: -6 },
  e: { top: "calc(50% - 6px)", right: -6 },
  se: { bottom: -6, right: -6 },
  s: { bottom: -6, left: "calc(50% - 6px)" },
  sw: { bottom: -6, left: -6 },
  w: { top: "calc(50% - 6px)", left: -6 },
};

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

interface CropSelectorProps {
  /** The picture shown under the frame: the source, or a smaller stand-in of its aspect. */
  imageUrl: string;
  /**
   * The size of the picture the frame will be applied to, when the shown
   * picture is a stand-in. The frame is held and reported in these pixels, so
   * swapping the shown picture for another stand-in of the same source keeps
   * it where it was. Defaults to the shown picture's own size.
   */
  sourceSize?: ImageDims;
  /** Accessible name of the picture, in the page's language. */
  alt: string;
  /** Accessible name of each resize handle. */
  handleLabels: Record<ResizeHandle, string>;
  targetWidth: number;
  targetHeight: number;
  onCropChange: (crop: CropRect) => void;
  /**
   * The frame to start from, e.g. one the user set before the selector was
   * last shown; used while it fits the image and the target ratio, otherwise
   * the centred, largest frame.
   */
  initialCrop?: CropRect | null;
  /** Shows the frame without handles and ignores drags, e.g. while a run uses it. */
  readOnly?: boolean;
}

function sameRect(a: CropRect, b: CropRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function CropSelector({
  imageUrl,
  sourceSize,
  alt,
  targetWidth,
  targetHeight,
  onCropChange,
  handleLabels,
  initialCrop = null,
  readOnly = false,
}: CropSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });
  const [displayBox, setDisplayBox] = useState<Box>(EMPTY_BOX);
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  // Where the drag began, already read as source pixels.
  const dragStart = useRef({ x: 0, y: 0, cropX: 0, cropY: 0 });
  const [resizing, setResizing] = useState<ResizeHandle | null>(null);
  const resizeStart = useRef<{ rect: CropRect }>({
    rect: { x: 0, y: 0, width: 0, height: 0 },
  });

  // Read once per mount, not tracked: the selector owns the frame after
  // that, and echoing each change back must not restart it.
  const initialCropRef = useRef(initialCrop);

  const sourceW = sourceSize?.w ?? imgNatural.w;
  const sourceH = sourceSize?.h ?? imgNatural.h;
  const source = { w: sourceW, h: sourceH };

  // The frame is placed when the source or the target ratio changes, never
  // because the shown picture did: a stand-in swapped for another of the
  // same source keeps the frame as it is, in the same source pixels.
  useEffect(() => {
    if (sourceW <= 0 || sourceH <= 0) return;
    const dims = { w: sourceW, h: sourceH };
    const start = initialCropRef.current;
    const rect =
      start && cropFits(start, dims, targetWidth / targetHeight)
        ? start
        : maxFitCrop(dims, targetWidth, targetHeight);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-place the frame when the source or target size changes
    setCrop(rect);
    onCropChange(rect);
  }, [targetWidth, targetHeight, sourceW, sourceH, onCropChange]);

  const handleImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const natural = { w: img.naturalWidth, h: img.naturalHeight };
    setImgNatural(natural);
    setDisplayBox(containBox({ w: img.clientWidth, h: img.clientHeight }, natural));
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(() => {
      const img = imgRef.current;
      if (img && imgNatural.w > 0 && imgNatural.h > 0) {
        setDisplayBox(containBox({ w: img.clientWidth, h: img.clientHeight }, imgNatural));
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [imgNatural]);

  const ready = sourceW > 0 && sourceH > 0 && displayBox.w > 0 && displayBox.h > 0;
  const displayCrop = ready ? frameInBox(crop, displayBox, source) : EMPTY_BOX;

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
    const at = pointInSource({ x: e.clientX, y: e.clientY }, displayBox, source);
    dragStart.current = { x: at.x, y: at.y, cropX: crop.x, cropY: crop.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const at = pointInSource({ x: e.clientX, y: e.clientY }, displayBox, source);
    const dx = at.x - dragStart.current.x;
    const dy = at.y - dragStart.current.y;

    let newX = Math.round(dragStart.current.cropX + dx);
    let newY = Math.round(dragStart.current.cropY + dy);

    newX = Math.max(0, Math.min(newX, sourceW - crop.width));
    newY = Math.max(0, Math.min(newY, sourceH - crop.height));

    const rect = { ...crop, x: newX, y: newY };
    if (sameRect(rect, crop)) return;
    setCrop(rect);
    onCropChange(rect);
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  const handleResizePointerDown = (
    e: ReactPointerEvent<HTMLDivElement>,
    handle: ResizeHandle,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(handle);
    resizeStart.current = { rect: crop };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleResizePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizing) return;
    const rectEl = imgRef.current;
    if (!rectEl) return;
    const rect = rectEl.getBoundingClientRect();
    const mouse = pointInSource(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      displayBox,
      source,
    );

    const next = aspectLockedResize(
      resizing,
      resizeStart.current.rect,
      mouse,
      targetWidth / targetHeight,
      source,
    );
    if (sameRect(next, crop)) return;
    setCrop(next);
    onCropChange(next);
  };

  const handleResizePointerUp = () => {
    setResizing(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-block w-full select-none overflow-hidden rounded-lg border bg-muted/30"
    >
        <img
          ref={imgRef}
          src={imageUrl}
          alt={alt}
          className="block h-auto max-h-80 w-full object-contain"
          onLoad={handleImgLoad}
          draggable={false}
        />

        {ready && (
          <>
            {/* Dim overlay — 4 rects around the crop */}
            <div
              className="pointer-events-none absolute top-0 left-0 right-0 bg-black/50"
              style={{ height: displayCrop.y }}
            />
            <div
              className="pointer-events-none absolute left-0 bg-black/50"
              style={{
                top: displayCrop.y,
                width: displayCrop.x,
                height: displayCrop.h,
              }}
            />
            <div
              className="pointer-events-none absolute bg-black/50"
              style={{
                top: displayCrop.y,
                left: displayCrop.x + displayCrop.w,
                right: 0,
                height: displayCrop.h,
              }}
            />
            <div
              className="pointer-events-none absolute left-0 right-0 bg-black/50"
              style={{
                top: displayCrop.y + displayCrop.h,
                bottom: 0,
              }}
            />

            {/* Crop handle */}
            <div
              className={
                readOnly
                  ? "pointer-events-none absolute border-2 border-white/80 shadow-sm"
                  : "absolute cursor-move border-2 border-white/80 shadow-sm"
              }
              // The frame moves under a finger instead of the page scrolling.
              style={{
                top: displayCrop.y,
                left: displayCrop.x,
                width: displayCrop.w,
                height: displayCrop.h,
                touchAction: "none",
              }}
              onPointerDown={readOnly ? undefined : handlePointerDown}
              onPointerMove={readOnly ? undefined : handlePointerMove}
              onPointerUp={readOnly ? undefined : handlePointerUp}
              onPointerCancel={readOnly ? undefined : handlePointerUp}
            >
              {/* 8 resize handles */}
              {!readOnly && (["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((h) => (
                <div
                  key={h}
                  role="button"
                  aria-label={handleLabels[h]}
                  // A finger needs more than the 12 px handle: on a touch
                  // screen an invisible 36 px area around it catches the drag.
                  className="absolute size-3 rounded-sm border-2 border-white bg-white/90 shadow pointer-coarse:before:absolute pointer-coarse:before:-inset-3 pointer-coarse:before:content-['']"
                  style={{
                    ...HANDLE_POSITIONS[h],
                    cursor: HANDLE_CURSORS[h],
                    touchAction: "none",
                  }}
                  onPointerDown={(e) => handleResizePointerDown(e, h)}
                  onPointerMove={handleResizePointerMove}
                  onPointerUp={handleResizePointerUp}
                  onPointerCancel={handleResizePointerUp}
                />
              ))}
            </div>
          </>
        )}
    </div>
  );
}
