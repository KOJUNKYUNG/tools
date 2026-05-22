"use client";

import { memo } from "react";
import { RotateCwIcon, Trash2Icon } from "lucide-react";
import type { PageItem } from "@/lib/pdf/pageItem";
import { useLazyThumbnail } from "./useLazyThumbnail";

export interface SectionTint {
  /** Ring color used as the per-page section grouping cue. */
  ring: string;
}

interface PageItemCardProps {
  item: PageItem;
  pageNumber: number;
  bytes: Uint8Array | undefined;
  tint: SectionTint;
  onRotate: (id: string) => void;
  onDelete: (id: string) => void;
  rotateAria: string;
  deleteAria: string;
  /** dnd-kit drag handle props (listeners + attributes) applied to the sheet. */
  dragHandleProps?: Record<string, unknown>;
}

function PageItemCardImpl({
  item,
  pageNumber,
  bytes,
  tint,
  onRotate,
  onDelete,
  rotateAria,
  deleteAria,
  dragHandleProps,
}: PageItemCardProps) {
  const thumb = useLazyThumbnail({
    fileId: item.sourceFileId,
    pageIndex: item.sourcePageIndex,
    kind: item.kind,
    bytes,
  });

  return (
    <div
      className="group relative my-[9px] h-[204px] w-[150px] cursor-grab overflow-hidden rounded-lg bg-white active:cursor-grabbing"
      style={{
        border: "1px solid var(--silver-200)",
        boxShadow: `var(--shadow-sm), 0 0 0 3px ${tint.ring}`,
      }}
      {...dragHandleProps}
    >
      <div
        ref={thumb.ref}
        className="absolute inset-0 flex items-center justify-center"
      >
        {thumb.status === "ready" && thumb.src ? (
          <img
            src={thumb.src}
            alt={`page ${pageNumber}`}
            draggable={false}
            className="max-h-full max-w-full object-contain"
            style={{ transform: `rotate(${item.rotation}deg)` }}
          />
        ) : thumb.status === "error" ? (
          <span className="px-2 text-center text-[10px] text-[color:var(--ink-soft)]">
            미리보기 실패
          </span>
        ) : (
          // Skeleton placeholder while idle/loading (matches sheet line motif).
          <div className="flex w-full flex-col gap-[7px] px-[14px]">
            <div className="h-1.5 w-[85%] rounded bg-[var(--silver-200)]" />
            <div className="h-1.5 w-full rounded bg-[var(--silver-200)]" />
            <div className="h-1.5 w-[60%] rounded bg-[var(--silver-200)]" />
            <div className="h-1.5 w-full rounded bg-[var(--silver-200)]" />
          </div>
        )}
      </div>

      <span
        className="pointer-events-none absolute left-1.5 top-1.5 rounded-md px-[7px] py-px text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: "rgba(20,30,60,0.85)" }}
      >
        {pageNumber}
      </span>

      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onRotate(item.id)}
          aria-label={rotateAria}
          title={rotateAria}
          className="flex size-6 items-center justify-center rounded-md border bg-white/95 shadow-sm"
          style={{ borderColor: "var(--silver-200)", color: "var(--silver-700)" }}
        >
          <RotateCwIcon className="size-3.5" />
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(item.id)}
          aria-label={deleteAria}
          title={deleteAria}
          className="flex size-6 items-center justify-center rounded-md border bg-white/95 shadow-sm"
          style={{ borderColor: "var(--silver-200)", color: "oklch(0.55 0.22 27)" }}
        >
          <Trash2Icon className="size-3.5" />
        </button>
      </div>

      <div
        className="pointer-events-none absolute inset-x-2 bottom-1.5 truncate rounded-md border bg-white/95 px-1 py-0.5 text-center text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
        style={{ borderColor: "var(--silver-200)", color: "var(--silver-700)" }}
      >
        {item.sourceFileName}
      </div>
    </div>
  );
}

export const PageItemCard = memo(PageItemCardImpl);
