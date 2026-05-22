"use client";

import { DownloadIcon, FileIcon, RotateCcwIcon } from "lucide-react";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import type { PageItem } from "@/lib/pdf/pageItem";
import type { PdfArrangeLabels } from "./labels";
import { useLazyThumbnail } from "./useLazyThumbnail";

/** One produced output file (one section). */
export interface OutputEntry {
  name: string;
  data: Uint8Array;
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
      className="flex h-[88px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-white"
      style={{ border: "1px solid var(--silver-200)" }}
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
        <FileIcon className="size-6" style={{ color: "var(--silver-400)" }} />
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
            <span
              className="min-w-0 flex-1 truncate"
              style={{ color: "var(--ink-strong)" }}
            >
              {o.name}
            </span>
            <span className="shrink-0" style={{ color: "var(--ink-soft)" }}>
              {formatBytes(o.data.byteLength)}
            </span>
            <button
              type="button"
              onClick={() => onDownloadOne(o)}
              aria-label={template(labels.downloadOneAria, { name: o.name })}
              title={template(labels.downloadOneAria, { name: o.name })}
              className="shrink-0 rounded p-1 transition-colors hover:text-[color:var(--accent-electric)]"
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
          boxShadow: "inset 2px 0 0 var(--accent-electric)",
        }}
      >
        <div
          className="font-display text-[13px] font-semibold"
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
            className="glint inline-flex h-9 items-center justify-center gap-1.5 rounded-[5px] px-4 font-display text-[12px] font-medium"
            style={{ background: "var(--accent-electric)", color: "#fff" }}
          >
            <DownloadIcon className="size-3.5" />
            {primaryLabel}
          </button>
          <button
            type="button"
            onClick={onAgain}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[5px] border px-3 font-display text-[12px] transition-colors hover:border-[color:var(--accent-electric)]"
            style={{
              background: "var(--surface-2)",
              borderColor: "var(--border)",
              color: "var(--ink-strong)",
            }}
          >
            <RotateCcwIcon className="size-3.5" />
            {labels.again}
          </button>
        </div>
      </div>
    </div>
  );
}
