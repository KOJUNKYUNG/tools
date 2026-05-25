"use client";

import { useEffect, useMemo, useState } from "react";
import type { useRouter } from "next/navigation";
import { ArrowRightIcon, DownloadIcon, RotateCcwIcon } from "lucide-react";
import { PageItemCard } from "@/components/pdf-editor/PageItemCard";
import { buildPageItems } from "@/components/pdf-editor/buildPageItems";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { stageFiles } from "@/lib/common/toolHandoff";
import type { PageItem } from "@/lib/pdf/pageItem";
import type { ImageToPdfLabels } from "./labels";
import type { ImageToPdfResultData } from "./ImageToPdf";

const NEUTRAL_TINT = { ring: "transparent" } as const;

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

  const handleCompress = () => {
    const file = new File([result.bytes.slice().buffer as ArrayBuffer], result.name, {
      type: "application/pdf",
    });
    stageFiles([file], "image-to-pdf");
    router.push(`/${lang}/tools/pdf-compress`);
  };

  const sizeText = useMemo(() => formatBytes(result.bytes.byteLength), [result.bytes]);

  return (
    <div className="grid min-h-[440px] grid-cols-1 gap-4 md:grid-cols-2">
      <div className="ob-scroll overflow-y-auto pr-1" style={{ maxHeight: "440px" }}>
        <div className="flex flex-wrap justify-center gap-2">
          {pages.map((p, i) => (
            <PageItemCard
              key={p.id}
              item={p}
              pageNumber={i + 1}
              bytes={bytesById.get(p.sourceFileId)}
              tint={NEUTRAL_TINT}
              onRotate={() => {}}
              onDelete={() => {}}
              rotateAria=""
              deleteAria=""
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
          {template(labels.pageCountTemplate, { n: result.pageCount })} · {sizeText}
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
            onClick={handleCompress}
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
