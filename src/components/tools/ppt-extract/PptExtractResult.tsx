"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightIcon, DownloadIcon, RotateCcwIcon } from "lucide-react";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import type { ExtractedImage } from "@/lib/ppt/extractImages";
import {
  formatBreakdownString,
  getExt,
  isRenderable,
} from "@/lib/ppt/pptImageFormats";
import { ExtractedImageCard } from "./ExtractedImageCard";
import type { PptExtractLabels } from "./labels";

interface PptExtractResultProps {
  images: ExtractedImage[];
  labels: PptExtractLabels;
  onDownloadAll: () => void;
  onDownloadOne: (image: ExtractedImage) => void;
  onAgain: () => void;
  onToPptx: () => void;
}

export function PptExtractResult({
  images,
  labels,
  onDownloadAll,
  onDownloadOne,
  onAgain,
  onToPptx,
}: PptExtractResultProps) {
  // StrictMode-safe object URL batch — re-keyed on `images`.
  const [urls, setUrls] = useState<(string | null)[]>([]);
  useEffect(() => {
    const next: (string | null)[] = images.map((img) => {
      if (!isRenderable(getExt(img.name))) return null;
      // new Uint8Array(...) required for TS strict (BlobPart needs ArrayBuffer).
      return URL.createObjectURL(
        new Blob([new Uint8Array(img.data)], { type: img.mime }),
      );
    });
    setUrls(next);
    return () => {
      for (const u of next) if (u) URL.revokeObjectURL(u);
    };
  }, [images]);

  const totalSize = useMemo(
    () => images.reduce((sum, img) => sum + img.size, 0),
    [images],
  );

  // Stable per-image download callbacks; prevents re-creating 200 closures per
  // render once urls state updates (would defeat any memo on the card).
  const downloadCallbacks = useMemo(
    () => images.map((img) => () => onDownloadOne(img)),
    [images, onDownloadOne],
  );

  // Format breakdown chip — e.g. "PNG 12 · JPG 3 · EMF 2".
  const breakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const img of images) {
      const ext = (getExt(img.name) || "?").toUpperCase();
      counts[ext] = (counts[ext] ?? 0) + 1;
    }
    return formatBreakdownString(counts);
  }, [images]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2" style={{ height: "52vh" }}>
      <div className="ob-scroll min-h-0 overflow-y-auto pr-1">
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, i) => (
            <ExtractedImageCard
              key={`${img.name}-${i}`}
              url={urls[i] ?? null}
              name={img.name}
              size={img.size}
              index={i + 1}
              placeholderLabel={labels.placeholderLabel}
              onDownload={downloadCallbacks[i]}
              downloadAria={template(labels.downloadOneAria, { name: img.name })}
            />
          ))}
        </div>
      </div>

      <div
        className="flex flex-col gap-2 self-start rounded-[8px] border p-4"
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
          {template(labels.imageCountTemplate, { n: images.length })} · {formatBytes(totalSize)}
        </div>
        {breakdown && (
          <div className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
            {breakdown}
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onDownloadAll}
            className="btn-download glint inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-4 font-display text-[12px] font-medium"
          >
            <DownloadIcon className="size-3.5" />
            {labels.downloadZip}
          </button>
          {images.length > 0 && (
            <button
              type="button"
              onClick={onToPptx}
              className="handoff-action inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] border px-3 font-display text-[12px]"
            >
              {labels.toPptx}
              <ArrowRightIcon className="size-3.5" />
            </button>
          )}
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
