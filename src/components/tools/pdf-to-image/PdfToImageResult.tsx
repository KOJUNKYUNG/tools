"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightIcon, DownloadIcon, RotateCcwIcon } from "lucide-react";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import type { ConvertedImage } from "@/lib/pdf/pdfToImage";
import type { PdfToImageLabels } from "./labels";

interface ResultCellProps {
  url: string | undefined;
  name: string;
  size: number;
  index: number;
  onDownload: () => void;
  downloadAria: string;
}

function ResultCell({
  url,
  name,
  size,
  index,
  onDownload,
  downloadAria,
}: ResultCellProps) {
  return (
    <div
      className="group relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-[5px]"
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
      ) : null}

      <span
        className="pointer-events-none absolute left-1.5 top-1.5 rounded-md px-[7px] py-px text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: "rgba(20,30,60,0.85)" }}
      >
        {index}
      </span>

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

      <div
        className="pointer-events-none absolute inset-x-2 bottom-1.5 truncate rounded-md border bg-white/95 px-1 py-0.5 text-center text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
        style={{ borderColor: "var(--silver-200)", color: "var(--silver-700)" }}
      >
        {name} · {formatBytes(size)}
      </div>
    </div>
  );
}

interface PdfToImageResultProps {
  images: ConvertedImage[];
  labels: PdfToImageLabels;
  onDownloadAll: () => void;
  onDownloadOne: (image: ConvertedImage) => void;
  onCompress: () => void;
  onAgain: () => void;
}

export function PdfToImageResult({
  images,
  labels,
  onDownloadAll,
  onDownloadOne,
  onCompress,
  onAgain,
}: PdfToImageResultProps) {
  // Create object URLs for the result blobs, keyed on the images array, and
  // revoke them on cleanup. StrictMode double-mount re-creates fresh URLs and
  // revokes only its own batch, so no URL ever dies under a live <img>.
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = images.map((img) => URL.createObjectURL(img.blob));
    setUrls(next);
    return () => {
      for (const u of next) URL.revokeObjectURL(u);
    };
  }, [images]);

  const totalSize = useMemo(
    () => images.reduce((sum, img) => sum + img.blob.size, 0),
    [images],
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2" style={{ height: "52vh" }}>
      <div className="ob-scroll min-h-0 overflow-y-auto pr-1">
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, i) => (
            <ResultCell
              key={img.name}
              url={urls[i]}
              name={img.name}
              size={img.blob.size}
              index={i + 1}
              onDownload={() => onDownloadOne(img)}
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
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onDownloadAll}
            className="btn-download glint inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-4 font-display text-[12px] font-medium"
          >
            <DownloadIcon className="size-3.5" />
            {labels.download}
          </button>
          <button
            type="button"
            onClick={onCompress}
            className="handoff-action inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] border px-3 font-display text-[12px]"
          >
            {labels.compressHandoff}
            <ArrowRightIcon className="size-3.5" />
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
