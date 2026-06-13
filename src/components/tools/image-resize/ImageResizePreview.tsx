"use client";

import { CropSelector, type CropRect } from "@/components/image/CropSelector";
import { template } from "@/lib/common/template";

interface ImageResizePreviewProps {
  imageUrl: string | null;
  cropEnabled: boolean;
  targetW: number;
  targetH: number;
  onCropChange: (rect: CropRect) => void;
  cropRect: CropRect | null;
  cropSelectionLabel: string;
  stretchModeLabel: string;
  cropFooterTemplate: string;
}

export function ImageResizePreview({
  imageUrl,
  cropEnabled,
  targetW,
  targetH,
  onCropChange,
  cropRect,
  cropSelectionLabel,
  stretchModeLabel,
  cropFooterTemplate,
}: ImageResizePreviewProps) {
  if (!imageUrl) return null;

  const body =
    cropEnabled && targetW > 0 && targetH > 0 ? (
      <CropSelector
        imageUrl={imageUrl}
        targetWidth={targetW}
        targetHeight={targetH}
        onCropChange={onCropChange}
      />
    ) : (
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

  const footerText =
    cropEnabled && cropRect && targetW > 0 && targetH > 0
      ? template(cropFooterTemplate, {
          w: String(targetW),
          h: String(targetH),
          cw: String(cropRect.width),
          ch: String(cropRect.height),
        })
      : " ";

  return (
    <div className="space-y-2">
      <p
        className="font-body text-[12px] font-medium"
        style={{ color: "var(--ink-strong)" }}
      >
        {cropEnabled ? cropSelectionLabel : stretchModeLabel}
      </p>
      {body}
      <p
        className="font-body text-[11px] min-h-[1.25em]"
        style={{ color: "var(--ink-soft)" }}
      >
        {footerText}
      </p>
    </div>
  );
}
