"use client";

import type * as React from "react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { maxFitCrop, type CropRect } from "@/lib/image/maxFitCrop";
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
  imageUrl: string;
  targetWidth: number;
  targetHeight: number;
  onCropChange: (crop: CropRect) => void;
}

interface DisplayBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function sameRect(a: CropRect, b: CropRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function computeDisplayBox(
  elementW: number,
  elementH: number,
  naturalW: number,
  naturalH: number,
): DisplayBox {
  if (elementW <= 0 || elementH <= 0 || naturalW <= 0 || naturalH <= 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  const elementRatio = elementW / elementH;
  const naturalRatio = naturalW / naturalH;
  let w: number;
  let h: number;
  if (elementRatio > naturalRatio) {
    // element wider than image → image is height-limited, letterboxed horizontally
    h = elementH;
    w = elementH * naturalRatio;
  } else {
    // element taller than image → image is width-limited, letterboxed vertically
    w = elementW;
    h = elementW / naturalRatio;
  }
  return { x: (elementW - w) / 2, y: (elementH - h) / 2, w, h };
}

export function CropSelector({
  imageUrl,
  targetWidth,
  targetHeight,
  onCropChange,
}: CropSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });
  const [displayBox, setDisplayBox] = useState<DisplayBox>({ x: 0, y: 0, w: 0, h: 0 });
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, cropX: 0, cropY: 0 });
  const [resizing, setResizing] = useState<ResizeHandle | null>(null);
  const resizeStart = useRef<{ rect: CropRect }>({
    rect: { x: 0, y: 0, width: 0, height: 0 },
  });

  const initCrop = useCallback(
    (natW: number, natH: number) => {
      const rect = maxFitCrop({ w: natW, h: natH }, targetWidth, targetHeight);
      setCrop(rect);
      onCropChange(rect);
    },
    [targetWidth, targetHeight, onCropChange],
  );

  const handleImgLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const natW = img.naturalWidth;
      const natH = img.naturalHeight;
      setImgNatural({ w: natW, h: natH });
      setDisplayBox(
        computeDisplayBox(img.clientWidth, img.clientHeight, natW, natH),
      );
      initCrop(natW, natH);
    },
    [initCrop],
  );

  useEffect(() => {
    if (imgNatural.w > 0) {
      initCrop(imgNatural.w, imgNatural.h);
    }
  }, [targetWidth, targetHeight, imgNatural.w, imgNatural.h, initCrop]);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const img = entries[0]?.target.querySelector("img");
      if (img && imgNatural.w > 0 && imgNatural.h > 0) {
        setDisplayBox(
          computeDisplayBox(img.clientWidth, img.clientHeight, imgNatural.w, imgNatural.h),
        );
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [imgNatural.w, imgNatural.h]);

  const ready =
    imgNatural.w > 0 && imgNatural.h > 0 && displayBox.w > 0 && displayBox.h > 0;
  const scaleX = ready ? displayBox.w / imgNatural.w : 1;
  const scaleY = ready ? displayBox.h / imgNatural.h : 1;

  const displayCrop = {
    x: displayBox.x + crop.x * scaleX,
    y: displayBox.y + crop.y * scaleY,
    w: crop.width * scaleX,
    h: crop.height * scaleY,
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      cropX: crop.x,
      cropY: crop.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const dx = (e.clientX - dragStart.current.x) / scaleX;
    const dy = (e.clientY - dragStart.current.y) / scaleY;

    let newX = Math.round(dragStart.current.cropX + dx);
    let newY = Math.round(dragStart.current.cropY + dy);

    newX = Math.max(0, Math.min(newX, imgNatural.w - crop.width));
    newY = Math.max(0, Math.min(newY, imgNatural.h - crop.height));

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
    const rectEl = containerRef.current?.querySelector("img");
    if (!rectEl) return;
    const rect = rectEl.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - displayBox.x) / scaleX;
    const mouseY = (e.clientY - rect.top - displayBox.y) / scaleY;

    const next = aspectLockedResize(
      resizing,
      resizeStart.current.rect,
      { x: mouseX, y: mouseY },
      targetWidth / targetHeight,
      { w: imgNatural.w, h: imgNatural.h },
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
          src={imageUrl}
          alt="원본 미리보기"
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
              className="absolute cursor-move border-2 border-white/80 shadow-sm"
              style={{
                top: displayCrop.y,
                left: displayCrop.x,
                width: displayCrop.w,
                height: displayCrop.h,
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {/* 8 resize handles */}
              {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((h) => (
                <div
                  key={h}
                  role="button"
                  aria-label={`Resize ${h}`}
                  className="absolute size-3 rounded-sm border-2 border-white bg-white/90 shadow"
                  style={{
                    ...HANDLE_POSITIONS[h],
                    cursor: HANDLE_CURSORS[h],
                    touchAction: "none",
                  }}
                  onPointerDown={(e) => handleResizePointerDown(e, h)}
                  onPointerMove={handleResizePointerMove}
                  onPointerUp={handleResizePointerUp}
                />
              ))}
            </div>
          </>
        )}
    </div>
  );
}
