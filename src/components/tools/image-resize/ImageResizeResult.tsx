"use client";

import { formatBytes } from "@/lib/common/formatBytes";
import { ResultCard } from "@/components/common/ResultCard";
import { ResultActions, HandoffAction } from "@/components/common/ResultActions";

interface ImageResizeResultProps {
  doneTitle: string;
  downloadLabel: string;
  compressLinkLabel: string;
  width: number;
  height: number;
  byteSize: number;
  mimeType: string;
  onDownload: () => void;
  onCompressOrConvert: () => void;
}

function formatLabel(mime: string): string {
  if (mime === "image/jpeg") return "JPG";
  if (mime === "image/png") return "PNG";
  if (mime === "image/webp") return "WebP";
  return mime.replace(/^image\//, "").toUpperCase();
}

export function ImageResizeResult({
  doneTitle,
  downloadLabel,
  compressLinkLabel,
  width,
  height,
  byteSize,
  mimeType,
  onDownload,
  onCompressOrConvert,
}: ImageResizeResultProps) {
  return (
    <ResultCard
      title={doneTitle}
      actions={
        <ResultActions
          download={{ label: downloadLabel, onClick: onDownload }}
          extra={
            <HandoffAction label={compressLinkLabel} onClick={onCompressOrConvert} />
          }
        />
      }
    >
      <div className="flex items-baseline gap-1.5">
        <span
          className="font-body text-[15px] font-bold tabular-nums"
          style={{ color: "var(--headline)" }}
        >
          {width}×{height}
        </span>
        <span className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
          ({formatBytes(byteSize)}, {formatLabel(mimeType)})
        </span>
      </div>
    </ResultCard>
  );
}
