"use client";

import { DownloadIcon, FileIcon, RotateCcwIcon } from "lucide-react";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import type { PageItem } from "@/lib/pdf/pageItem";
import type { PdfArrangeLabels } from "./labels";
import { useLazyThumbnail } from "@/components/pdf-editor/useLazyThumbnail";

/** One produced output file (one section). */
export interface OutputEntry {
  name: string;
  data: Uint8Array;
  /** Number of pages in this output file. */
  pageCount: number;
  /** First page of the section — reused as the row's cover thumbnail. */
  cover: PageItem;
}

export interface ArrangeResult {
  outputs: OutputEntry[];
  /** Single pdf (1 section) or a zip (N sections), for the primary download. */
  isZip: boolean;
  /** Output base name (first file, sans ext) — used to package the zip. */
  base: string;
}

function CoverThumb({
  cover,
  bytes,
}: {
  cover: PageItem;
  bytes: Uint8Array | undefined;
}) {
  const thumb = useLazyThumbnail({
    fileId: cover.sourceFileId,
    pageIndex: cover.sourcePageIndex,
    kind: cover.kind,
    bytes,
  });

  return (
    <div
      ref={thumb.ref}
      className="flex h-[88px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-[color:var(--mono-0)]"
      style={{ border: "1px solid var(--border)" }}
    >
      {thumb.status === "ready" && thumb.src ? (
        <img
          src={thumb.src}
          alt=""
          draggable={false}
          className="max-h-full max-w-full object-contain"
          style={{ transform: `rotate(${cover.rotation}deg)` }}
        />
      ) : (
        <FileIcon className="size-6" style={{ color: "var(--ink-soft)" }} />
      )}
    </div>
  );
}

interface PdfArrangeResultProps {
  result: ArrangeResult;
  sourceBytesById: Map<string, Uint8Array>;
  labels: PdfArrangeLabels;
  onDownloadAll: () => void;
  onDownloadOne: (entry: OutputEntry) => void;
  onAgain: () => void;
}

export function PdfArrangeResult({
  result,
  sourceBytesById,
  labels,
  onDownloadAll,
  onDownloadOne,
  onAgain,
}: PdfArrangeResultProps) {
  const { outputs, isZip } = result;
  const count = outputs.length;

  const primaryLabel = isZip
    ? template(labels.downloadZipTemplate, { n: count })
    : labels.downloadPdf;

  return (
    <div className="grid min-h-[440px] grid-cols-1 gap-4 md:grid-cols-2">
      <div
        className="ob-scroll space-y-1.5 overflow-y-auto pr-1"
        style={{ maxHeight: "440px" }}
      >
        {outputs.map((o, i) => (
          <div
            key={`${o.name}-${i}`}
            className="flex items-center gap-2.5 rounded-[6px] border p-2 font-body text-[12px]"
            style={{
              background: "var(--surface-2)",
              borderColor: "var(--border)",
            }}
          >
            <CoverThumb
              cover={o.cover}
              bytes={sourceBytesById.get(o.cover.sourceFileId)}
            />
            <div className="min-w-0 flex-1">
              <div
                className="truncate"
                style={{ color: "var(--ink-strong)" }}
              >
                {o.name}
              </div>
              <div
                className="mt-0.5 text-[11px]"
                style={{ color: "var(--ink-soft)" }}
              >
                {template(labels.pageCountTemplate, { n: o.pageCount })} ·{" "}
                {formatBytes(o.data.byteLength)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDownloadOne(o)}
              aria-label={template(labels.downloadOneAria, { name: o.name })}
              title={template(labels.downloadOneAria, { name: o.name })}
              className="shrink-0 rounded p-1 transition-colors hover:text-[color:var(--emphasis)]"
              style={{ color: "var(--ink-soft)" }}
            >
              <DownloadIcon className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div
        className="flex flex-col gap-2 self-start rounded-[8px] border p-4"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "inset 2px 0 0 var(--emphasis)",
        }}
      >
        <div
          className="font-ko text-[13px] font-medium"
          style={{ color: "var(--headline)" }}
        >
          {labels.resultTitle}
        </div>
        {isZip && (
          <div
            className="font-body text-[11.5px]"
            style={{ color: "var(--ink-soft)" }}
          >
            {template(labels.outputCountTemplate, { n: count })}
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onDownloadAll}
            className="btn-download inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-4 font-body text-[12px] font-medium"
          >
            <DownloadIcon className="size-3.5" />
            {primaryLabel}
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
