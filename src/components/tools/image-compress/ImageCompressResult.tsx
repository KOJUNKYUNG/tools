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
      className="result-pop space-y-2 rounded-[8px] border p-3"
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
      <div className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
        {settingsText}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onDownload}
          className="btn-download inline-flex h-8 items-center justify-start gap-1.5 rounded-[9px] px-3 font-body text-[11.5px] font-medium"
        >
          <DownloadIcon className="size-3" />
          {downloadLabel}
        </button>
        <button
          type="button"
          onClick={onRecompress}
          className="nameplate inline-flex h-8 items-center justify-start gap-1.5 rounded-[9px] px-3 font-body text-[11.5px]"
          style={{ color: "var(--ink-strong)" }}
        >
          <RotateCcwIcon className="size-3" />
          {recompressLabel}
        </button>
      </div>
    </div>
  );
}
