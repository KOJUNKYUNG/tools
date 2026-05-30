"use client";

import { useMemo } from "react";
import { DownloadIcon, RotateCcwIcon } from "lucide-react";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import type { ImageToPptxLabels } from "./labels";
import type { ImageToPptxResultData } from "./ImageToPptx";

interface ImageToPptxResultProps {
  result: ImageToPptxResultData;
  labels: ImageToPptxLabels;
  onDownload: () => void;
  onAgain: () => void;
}

export function ImageToPptxResult({
  result,
  labels,
  onDownload,
  onAgain,
}: ImageToPptxResultProps) {
  const sizeText = useMemo(() => formatBytes(result.bytes.byteLength), [result.bytes]);

  return (
    <div className="flex justify-end">
      <div
        className="flex w-full max-w-sm flex-col gap-2 rounded-[8px] border p-4"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "inset 2px 0 0 var(--accent-electric)",
        }}
      >
        <div className="font-display text-[13px] font-semibold" style={{ color: "var(--headline)" }}>
          {labels.resultTitle}
        </div>
        <div className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
          {template(labels.slideCountTemplate, { n: result.slideCount })} · {sizeText}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onDownload}
            className="btn-download glint inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-4 font-display text-[12px] font-medium"
          >
            <DownloadIcon className="size-3.5" />
            {labels.download}
          </button>
          <button
            type="button"
            onClick={onAgain}
            className="nameplate inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-3 font-display text-[12px]"
            style={{ color: "var(--ink-strong)" }}
          >
            <RotateCcwIcon className="size-3.5" />
            {labels.again}
          </button>
        </div>
      </div>
    </div>
  );
}
