"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropSelectorProps {
  imageUrl: string;
  targetWidth: number;
  targetHeight: number;
  onCropChange: (crop: CropRect) => void;
}

export function CropSelector({
  imageUrl,
  targetWidth,
  targetHeight,
  onCropChange,
}: CropSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, cropX: 0, cropY: 0 });

  const targetAspect = targetWidth / targetHeight;

  const initCrop = useCallback(
    (natW: number, natH: number) => {
      let cropW: number;
      let cropH: number;
      const imgAspect = natW / natH;

      if (imgAspect > targetAspect) {
        cropH = natH;
        cropW = Math.round(natH * targetAspect);
      } else {
        cropW = natW;
        cropH = Math.round(natW / targetAspect);
      }

      const x = Math.round((natW - cropW) / 2);
      const y = Math.round((natH - cropH) / 2);
      const rect = { x, y, width: cropW, height: cropH };
      setCrop(rect);
      onCropChange(rect);
    },
    [targetAspect, onCropChange],
  );

  const handleImgLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const natW = img.naturalWidth;
      const natH = img.naturalHeight;
      setImgNatural({ w: natW, h: natH });
      setDisplaySize({ w: img.clientWidth, h: img.clientHeight });
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
      if (img) setDisplaySize({ w: img.clientWidth, h: img.clientHeight });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const scaleX = displaySize.w > 0 ? displaySize.w / imgNatural.w : 1;
  const scaleY = displaySize.h > 0 ? displaySize.h / imgNatural.h : 1;

  const displayCrop = {
    x: crop.x * scaleX,
    y: crop.y * scaleY,
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
    setCrop(rect);
    onCropChange(rect);
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        영역 선택 <span className="text-xs font-normal text-muted-foreground">(드래그하여 이동)</span>
      </p>
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

        {displaySize.w > 0 && (
          <>
            {/* Dim overlay — 4 rects around the crop */}
            <div
              className="pointer-events-none absolute top-0 left-0 bg-black/50"
              style={{ width: displaySize.w, height: displayCrop.y }}
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
                width: displaySize.w - displayCrop.x - displayCrop.w,
                height: displayCrop.h,
              }}
            />
            <div
              className="pointer-events-none absolute left-0 bg-black/50"
              style={{
                top: displayCrop.y + displayCrop.h,
                width: displaySize.w,
                height: displaySize.h - displayCrop.y - displayCrop.h,
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
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="border border-white/20" />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {targetWidth}×{targetHeight} 비율로 잘라냅니다 · 크롭 영역: {crop.width}×{crop.height}px
      </p>
    </div>
  );
}
