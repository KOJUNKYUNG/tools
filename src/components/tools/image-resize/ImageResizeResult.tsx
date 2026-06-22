"use client";

import { DownloadIcon, ArrowRightIcon, RotateCcwIcon } from "lucide-react";
import { formatBytes } from "@/lib/common/formatBytes";

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
  tryAgainLabel: string;
  onTryAgain: () => void;
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
  tryAgainLabel,
  onTryAgain,
}: ImageResizeResultProps) {
  return (
    <div
      className="result-pop rounded-[8px] border p-3 space-y-2"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "inset 2px 0 0 var(--emphasis)",
      }}
    >
      <div
        className="font-ko text-[12px] font-medium"
        style={{ color: "var(--headline)" }}
      >
        {doneTitle}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="font-body text-[15px] font-bold tabular-nums"
          style={{ color: "var(--headline)" }}
        >
          {width}×{height}
        </span>
        <span
          className="font-body text-[11.5px]"
          style={{ color: "var(--ink-soft)" }}
        >
          ({formatBytes(byteSize)}, {formatLabel(mimeType)})
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onDownload}
          className="btn-download inline-flex items-center justify-start gap-1.5 rounded-[9px] px-3 h-8 font-body text-[11.5px] font-medium"
        >
          <DownloadIcon className="size-3" />
          {downloadLabel}
        </button>
        <button
          type="button"
          onClick={onTryAgain}
          className="nameplate inline-flex items-center justify-start gap-1.5 rounded-[9px] px-3 h-8 font-body text-[11.5px]"
          style={{ color: "var(--ink-strong)" }}
        >
          <RotateCcwIcon className="size-3" />
          {tryAgainLabel}
        </button>
        <button
          type="button"
          onClick={onCompressOrConvert}
          className="handoff-action inline-flex items-center justify-start gap-1.5 rounded-[9px] border px-3 h-8 font-body text-[11.5px]"
        >
          {compressLinkLabel}
          <ArrowRightIcon className="size-3" />
        </button>
      </div>
    </div>
  );
}
