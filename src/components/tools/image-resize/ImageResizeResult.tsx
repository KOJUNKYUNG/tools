"use client";

import { DownloadIcon, ArrowRightIcon, RotateCcwIcon } from "lucide-react";

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

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
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
      className="rounded-[8px] border p-3 space-y-2"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "inset 2px 0 0 var(--accent-electric)",
      }}
    >
      <div
        className="font-display text-[12px] font-semibold"
        style={{ color: "var(--headline)" }}
      >
        {doneTitle}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="font-display text-[15px] font-bold"
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
          className="glint inline-flex items-center justify-start gap-1.5 rounded-[5px] px-3 h-8 font-display text-[11.5px] font-medium"
          style={{
            background: "var(--accent-electric)",
            color: "#fff",
          }}
        >
          <DownloadIcon className="size-3" />
          {downloadLabel}
        </button>
        <button
          type="button"
          onClick={onTryAgain}
          className="inline-flex items-center justify-start gap-1.5 rounded-[5px] border px-3 h-8 font-display text-[11.5px] transition-colors hover:border-[color:var(--accent-electric)]"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            color: "var(--ink-strong)",
          }}
        >
          <RotateCcwIcon className="size-3" />
          {tryAgainLabel}
        </button>
        <button
          type="button"
          onClick={onCompressOrConvert}
          className="inline-flex items-center justify-start gap-1.5 rounded-[5px] border px-3 h-8 font-display text-[11.5px] transition-colors hover:border-[color:var(--accent-electric)]"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            color: "var(--ink-strong)",
          }}
        >
          {compressLinkLabel}
          <ArrowRightIcon className="size-3" />
        </button>
      </div>
    </div>
  );
}
