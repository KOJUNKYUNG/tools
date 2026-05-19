"use client";

import { CropSelector, type CropRect } from "@/components/image/CropSelector";

interface ImageResizePreviewProps {
  imageUrl: string | null;
  cropEnabled: boolean;
  targetW: number;
  targetH: number;
  onCropChange: (rect: CropRect) => void;
}

export function ImageResizePreview({
  imageUrl,
  cropEnabled,
  targetW,
  targetH,
  onCropChange,
}: ImageResizePreviewProps) {
  if (!imageUrl) return null;

  if (cropEnabled && targetW > 0 && targetH > 0) {
    return (
      <CropSelector
        imageUrl={imageUrl}
        targetWidth={targetW}
        targetHeight={targetH}
        onCropChange={onCropChange}
      />
    );
  }

  return (
    <div
      className="relative inline-block w-full overflow-hidden rounded-[8px] border"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt="원본 미리보기"
        className="block h-auto max-h-80 w-full object-contain"
        draggable={false}
      />
    </div>
  );
}
