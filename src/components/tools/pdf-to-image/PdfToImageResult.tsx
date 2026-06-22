"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightIcon, DownloadIcon, RotateCcwIcon } from "lucide-react";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import type { ConvertedImage, OutputFormat } from "@/lib/pdf/pdfToImage";
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
      style={{ background: "var(--bg-soft)", border: "1px solid var(--border)" }}
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
        style={{ background: "rgba(0,0,0,0.7)" }}
      >
        {index}
      </span>

      <button
        type="button"
        onClick={onDownload}
        aria-label={downloadAria}
        title={downloadAria}
        className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md border bg-white/95 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
        style={{ borderColor: "var(--mono-200)", color: "var(--mono-900)" }}
      >
        <DownloadIcon className="size-3.5" />
      </button>

      <div
        className="pointer-events-none absolute inset-x-2 bottom-1.5 truncate rounded-md border bg-white/95 px-1 py-0.5 text-center text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
        style={{ borderColor: "var(--mono-200)", color: "var(--mono-900)" }}
      >
        {name} · {formatBytes(size)}
      </div>
    </div>
  );
}

interface PdfToImageResultProps {
  images: ConvertedImage[];
  labels: PdfToImageLabels;
  format: OutputFormat;
  onDownloadAll: () => void;
  onDownloadOne: (image: ConvertedImage) => void;
  onCompress: () => void;
  onAgain: () => void;
}

export function PdfToImageResult({
  images,
  labels,
  format,
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URLs are created in the effect so the cleanup revokes this exact batch (StrictMode-safe; see comment above)
    setUrls(next);
    return () => {
      for (const u of next) URL.revokeObjectURL(u);
    };
  }, [images]);

  const totalSize = useMemo(
    () => images.reduce((sum, img) => sum + img.blob.size, 0),
    [images],
  );

  // Single page → "다운로드 (JPG/PNG)"; multiple → "전체 다운로드 (ZIP)".
  const primaryDownloadLabel =
    images.length === 1
      ? template(labels.downloadSingleTemplate, {
          format: format === "image/png" ? labels.formatPng : labels.formatJpg,
        })
      : labels.download;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2" style={{ height: "52vh" }}>
      <div className="ob-scroll min-h-0 overflow-y-auto pr-1">
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, i) => (
            <ResultCell
              key={`${img.name}-${i}`}
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
        className="result-pop flex flex-col gap-2 self-start rounded-[8px] border p-4"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "inset 2px 0 0 var(--emphasis)",
        }}
      >
        <div className="font-ko text-[13px] font-medium" style={{ color: "var(--headline)" }}>
          {labels.resultTitle}
        </div>
        <div className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
          {template(labels.imageCountTemplate, { n: images.length })} · {formatBytes(totalSize)}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onDownloadAll}
            className="btn-download inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-4 font-body text-[12px] font-medium"
          >
            <DownloadIcon className="size-3.5" />
            {primaryDownloadLabel}
          </button>
          <button
            type="button"
            onClick={onCompress}
            className="handoff-action inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] border px-3 font-body text-[12px]"
          >
            {labels.compressHandoff}
            <ArrowRightIcon className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onAgain}
            className="nameplate inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-3 font-body text-[12px]"
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
