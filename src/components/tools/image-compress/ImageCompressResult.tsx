"use client";

import { DownloadIcon, RotateCcwIcon } from "lucide-react";

interface ImageCompressResultProps {
  doneTitle: string;
  settingsText: string;
  downloadLabel: string;
  recompressLabel: string;
  onDownload: () => void;
  onRecompress: () => void;
}

export function ImageCompressResult({
  doneTitle,
  settingsText,
  downloadLabel,
  recompressLabel,
  onDownload,
  onRecompress,
}: ImageCompressResultProps) {
  return (
    <div
      className="space-y-2 rounded-[8px] border p-3"
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
      <div className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
        {settingsText}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onDownload}
          className="glint inline-flex h-8 items-center justify-start gap-1.5 rounded-[5px] px-3 font-display text-[11.5px] font-medium"
          style={{ background: "var(--accent-electric)", color: "#fff" }}
        >
          <DownloadIcon className="size-3" />
          {downloadLabel}
        </button>
        <button
          type="button"
          onClick={onRecompress}
          className="inline-flex h-8 items-center justify-start gap-1.5 rounded-[5px] border px-3 font-display text-[11.5px] transition-colors hover:border-[color:var(--accent-electric)]"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            color: "var(--ink-strong)",
          }}
        >
          <RotateCcwIcon className="size-3" />
          {recompressLabel}
        </button>
      </div>
    </div>
  );
}
