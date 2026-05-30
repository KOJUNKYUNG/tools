"use client";

import { memo, useEffect, useState } from "react";
import { CopyPlusIcon, RotateCwIcon, Trash2Icon } from "lucide-react";
import type { PageItem } from "@/lib/pdf/pageItem";
import { useLazyThumbnail } from "./useLazyThumbnail";

export interface SectionTint {
  /** Ring color used as the per-page section grouping cue. */
  ring: string;
}

const CARD_W = 150;
const CARD_H = 204;
/** Cap the baked-rotation canvas so a full-res source can't make a huge data URL. */
const BAKE_MAX = 600;

interface PageItemCardProps {
  item: PageItem;
  pageNumber: number;
  bytes: Uint8Array | undefined;
  tint: SectionTint;
  onRotate?: (id: string) => void;
  onDelete: (id: string) => void;
  rotateAria?: string;
  deleteAria: string;
  onDuplicate?: (id: string) => void;
  duplicateAria?: string;
  /** dnd-kit drag handle props (listeners + attributes) applied to the sheet. */
  dragHandleProps?: Record<string, unknown>;
  /**
   * Card surface color. Default white (pdf-arrange). image-to-pdf uses a light
   * gray frame so the white output page stands out against it.
   */
  frameBg?: string;
  /**
   * When set (> 0), draw a white page rectangle of this width/height aspect
   * (centered, fit within the card) and place the image inside it — previews the
   * chosen output page size. When null/omitted, the image fills the card
   * directly (pdf-arrange behavior, unchanged).
   */
  pageAspect?: number | null;
  /**
   * When false, omit the grab cursor (a non-reorderable grid like pdf-to-image).
   * Default true preserves pdf-arrange / image-to-pdf behavior.
   */
  draggable?: boolean;
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
  onDuplicate,
  duplicateAria,
  dragHandleProps,
  frameBg = "#fff",
  pageAspect = null,
  draggable = true,
}: PageItemCardProps) {
  const thumb = useLazyThumbnail({
    fileId: item.sourceFileId,
    pageIndex: item.sourcePageIndex,
    kind: item.kind,
    bytes,
  });

  // White page-rect dimensions when previewing a fixed output page size.
  let boxW = CARD_W;
  let boxH = CARD_H;
  if (pageAspect != null && pageAspect > 0) {
    if (pageAspect >= CARD_W / CARD_H) {
      boxW = CARD_W;
      boxH = CARD_W / pageAspect;
    } else {
      boxH = CARD_H;
      boxW = CARD_H * pageAspect;
    }
  }

  const hasPage = pageAspect != null && pageAspect > 0;

  // Page-frame mode bakes rotation into a bitmap (canvas) instead of CSS-rotating.
  // CSS `transform: rotate()` on an element laid out wider than the card gets
  // clipped by the card's overflow:hidden BEFORE the rotation applies, so a
  // rotated image can't fill the page box. Baking matches how the result preview
  // (pdfjs-rendered page) already works — the rotated bitmap fills via plain
  // object-contain, no transform.
  const [bakedSrc, setBakedSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!hasPage || item.rotation === 0 || thumb.status !== "ready" || !thumb.src) {
      setBakedSrc(null);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const r = item.rotation;
      const swap = r === 90 || r === 270;
      const scale = Math.min(
        1,
        BAKE_MAX / Math.max(image.naturalWidth, image.naturalHeight),
      );
      const w = Math.max(1, Math.round(image.naturalWidth * scale));
      const h = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = swap ? h : w;
      canvas.height = swap ? w : h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((r * Math.PI) / 180); // clockwise, matches output
      ctx.drawImage(image, -w / 2, -h / 2, w, h);
      const url = canvas.toDataURL("image/png");
      canvas.width = 0;
      canvas.height = 0;
      if (!cancelled) setBakedSrc(url);
    };
    image.onerror = () => {
      if (!cancelled) setBakedSrc(null);
    };
    image.src = thumb.src;
    return () => {
      cancelled = true;
    };
  }, [hasPage, item.rotation, thumb.status, thumb.src]);

  // Plain mode (pdf-arrange): image fills the card, CSS-rotated. No page frame,
  // so no fill-on-rotate requirement — CSS transform is fine here.
  const plainImg =
    thumb.status === "ready" && thumb.src ? (
      <img
        src={thumb.src}
        alt={`page ${pageNumber}`}
        draggable={false}
        className="max-h-full max-w-full object-contain"
        style={{ transform: `rotate(${item.rotation}deg)` }}
      />
    ) : null;

  // Page-frame mode: show the (possibly rotation-baked) bitmap, contained in the
  // white page box. No CSS transform.
  const frameSrc = (item.rotation !== 0 && bakedSrc ? bakedSrc : thumb.src) ?? "";

  return (
    <div
      className={`group relative my-[9px] h-[204px] w-[150px] overflow-hidden rounded-[5px] ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      style={{
        background: frameBg,
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
          hasPage ? (
            <div
              className="flex items-center justify-center overflow-hidden"
              style={{ width: boxW, height: boxH, background: "#fff" }}
            >
              <img
                src={frameSrc}
                alt={`page ${pageNumber}`}
                draggable={false}
                className="h-full w-full object-contain"
              />
            </div>
          ) : (
            plainImg
          )
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
        {onRotate && (
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
        )}
        {onDuplicate && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDuplicate(item.id)}
            aria-label={duplicateAria}
            title={duplicateAria}
            className="flex size-6 items-center justify-center rounded-md border bg-white/95 shadow-sm"
            style={{ borderColor: "var(--silver-200)", color: "var(--silver-700)" }}
          >
            <CopyPlusIcon className="size-3.5" />
          </button>
        )}
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
