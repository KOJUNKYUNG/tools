"use client";

import { DownloadIcon, FileImageIcon } from "lucide-react";
import { formatBytes } from "@/lib/common/formatBytes";
import { getExt } from "@/lib/ppt/pptImageFormats";

interface ExtractedImageCardProps {
  url: string | null;        // null when not renderable
  name: string;
  size: number;
  index: number;             // 1-based (trap h)
  placeholderLabel: string;
  onDownload: () => void;
  downloadAria: string;
}

export function ExtractedImageCard({
  url,
  name,
  size,
  index,
  placeholderLabel,
  onDownload,
  downloadAria,
}: ExtractedImageCardProps) {
  const ext = getExt(name).toUpperCase();
  return (
    <div
      className="group relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[5px]"
      style={{ background: "var(--silver-100)", border: "1px solid var(--silver-200)" }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-1.5 px-2 text-center">
          <FileImageIcon className="size-7" style={{ color: "var(--silver-500)" }} />
          <span
            className="font-display text-[10px] font-semibold tracking-wider"
            style={{ color: "var(--silver-700)" }}
          >
            {ext || "FILE"}
          </span>
          <span
            className="font-body text-[9.5px] leading-tight"
            style={{ color: "var(--silver-600)" }}
          >
            {placeholderLabel}
          </span>
        </div>
      )}

      {/* Number badge (top-left, hover-only) — fixed color (trap j) */}
      <span
        className="pointer-events-none absolute left-1.5 top-1.5 rounded-md px-[7px] py-px text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: "rgba(20,30,60,0.85)" }}
      >
        {index}
      </span>

      {/* Per-image download (top-right, hover-only) */}
      <button
        type="button"
        onClick={onDownload}
        aria-label={downloadAria}
        title={downloadAria}
        className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md border bg-white/95 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
        style={{ borderColor: "var(--silver-200)", color: "var(--silver-700)" }}
      >
        <DownloadIcon className="size-3.5" />
      </button>

      {/* Filename + bytes (bottom, hover-only) */}
      <div
        className="pointer-events-none absolute inset-x-2 bottom-1.5 truncate rounded-md border bg-white/95 px-1 py-0.5 text-center text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
        style={{ borderColor: "var(--silver-200)", color: "var(--silver-700)" }}
      >
        {name} · {formatBytes(size)}
      </div>
    </div>
  );
}
