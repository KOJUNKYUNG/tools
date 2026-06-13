"use client";

import { useEffect, useMemo, useState } from "react";
import type { useRouter } from "next/navigation";
import { ArrowRightIcon, DownloadIcon, RotateCcwIcon } from "lucide-react";
import { buildPageItems } from "@/components/pdf-editor/buildPageItems";
import { useLazyThumbnail } from "@/components/pdf-editor/useLazyThumbnail";
import { clearThumbnailCache } from "@/components/pdf-editor/thumbnailCache";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { stageFiles } from "@/lib/common/toolHandoff";
import type { PageItem } from "@/lib/pdf/pageItem";
import type { ImageToPdfLabels } from "./labels";
import type { ImageToPdfResultData } from "./ImageToPdf";

/** Read-only output-page thumbnail: gray frame + the rendered PDF page (which
 *  already carries the white A4/custom letterbox). No rotate/delete controls. */
function ResultThumb({
  page,
  bytes,
}: {
  page: PageItem;
  bytes: Uint8Array | undefined;
}) {
  const { ref, src, status } = useLazyThumbnail({
    fileId: page.sourceFileId,
    pageIndex: page.sourcePageIndex,
    kind: page.kind,
    bytes,
  });

  return (
    <div
      ref={ref}
      className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-[5px]"
      style={{ background: "var(--bg-soft)", border: "1px solid var(--border)" }}
    >
      {status === "ready" && src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          className="max-h-full max-w-full object-contain"
          style={{ transform: `rotate(${page.rotation}deg)` }}
        />
      ) : null}
    </div>
  );
}

interface ImageToPdfResultProps {
  result: ImageToPdfResultData;
  labels: ImageToPdfLabels;
  onDownload: () => void;
  onAgain: () => void;
  lang: string;
  router: ReturnType<typeof useRouter>;
}

export function ImageToPdfResult({
  result,
  labels,
  onDownload,
  onAgain,
  lang,
  router,
}: ImageToPdfResultProps) {
  // Build read-only page items from the actual produced PDF so the preview shows
  // the real output framing (A4 / custom letterbox), not the source images.
  const [pages, setPages] = useState<PageItem[]>([]);
  const [bytesById, setBytesById] = useState<Map<string, Uint8Array>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const file = new File([result.bytes.slice().buffer as ArrayBuffer], result.name, {
      type: "application/pdf",
    });
    void buildPageItems([file]).then((built) => {
      if (cancelled) return;
      setPages(built.items);
      setBytesById(built.sourceBytesById);
    });
    return () => {
      cancelled = true;
    };
  }, [result]);

  // The preview renders the output PDF via pdfjs into the module-scoped thumbnail
  // cache. Drop it when the result view unmounts (e.g. "다시") so repeated
  // convert→again cycles don't leak pdfjs worker docs.
  useEffect(() => () => clearThumbnailCache(), []);

  const handleCompress = () => {
    const file = new File([result.bytes.slice().buffer as ArrayBuffer], result.name, {
      type: "application/pdf",
    });
    stageFiles([file], "image-to-pdf");
    router.push(`/${lang}/tools/pdf-compress`);
  };

  const sizeText = useMemo(() => formatBytes(result.bytes.byteLength), [result.bytes]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2" style={{ height: "52vh" }}>
      <div className="ob-scroll min-h-0 overflow-y-auto pr-1">
        <div className="grid grid-cols-3 gap-2">
          {pages.map((p) => (
            <ResultThumb key={p.id} page={p} bytes={bytesById.get(p.sourceFileId)} />
          ))}
        </div>
      </div>

      <div
        className="flex flex-col gap-2 self-start rounded-[8px] border p-4"
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
          {template(labels.pageCountTemplate, { n: result.pageCount })} · {sizeText}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onDownload}
            className="btn-download inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-4 font-body text-[12px] font-medium"
          >
            <DownloadIcon className="size-3.5" />
            {labels.download}
          </button>
          <button
            type="button"
            onClick={handleCompress}
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
