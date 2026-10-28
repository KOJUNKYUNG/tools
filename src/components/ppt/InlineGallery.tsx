"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, GalleryHorizontalEndIcon } from "lucide-react";
import { galleryTileClass, galleryTileStyle, TileSelectionMark } from "./GalleryTile";
import { GALLERY_IMAGES } from "@/lib/gallery/catalog";
import {
  GALLERY_CATEGORIES,
  type GalleryCategory,
  type GalleryImage,
} from "@/lib/gallery/types";
import { cn } from "@/lib/utils";
import { template } from "@/lib/common/template";

type CategoryFilter = "all" | GalleryCategory;

/** The gallery's text in the page language; tools pass it through unchanged. */
export interface GalleryLabels {
  heading: string;            // "배경 갤러리" / "Background gallery"
  countSuffixTemplate: string;  // e.g. "({n}개 이미지)"
  categoryAll: string;
  categoryByKey: Record<GalleryCategory, string>;
  empty: string;
  /** Image titles by gallery id. */
  titles: Record<string, string>;
}

interface InlineGalleryProps {
  onSelect: (image: GalleryImage) => void;
  selectedImageId?: string | null;
  forceCollapsed?: boolean;
  /** When true, render in always-open mode without the collapsible header. */
  forceOpen?: boolean;
  /**
   * When provided, the category filter is controlled by the parent and the
   * gallery's own internal category-chip row is hidden. Used by
   * BackgroundPicker, which renders the category tabs itself (v5 layout).
   */
  category?: CategoryFilter;
  labels: GalleryLabels;
}

export function InlineGallery({
  onSelect,
  selectedImageId,
  forceCollapsed,
  forceOpen = false,
  category: controlledCategory,
  labels,
}: InlineGalleryProps) {
  const [expanded, setExpanded] = useState(false);
  const [internalCategory, setInternalCategory] = useState<CategoryFilter>("all");
  const controlled = controlledCategory !== undefined;
  const category = controlled ? controlledCategory : internalCategory;
  const setCategory = setInternalCategory;
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.scrollTop = 0;
    }
  }, [category]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-way collapse when the parent forces it; deriving it would change re-expand semantics
    if (forceCollapsed) setExpanded(false);
  }, [forceCollapsed]);

  const filtered = useMemo(() => {
    if (category === "all") return GALLERY_IMAGES;
    return GALLERY_IMAGES.filter((img) => img.category === category);
  }, [category]);

  const open = forceOpen || expanded;

  return (
    <div
      className={cn(
        "rounded-[10px] border",
        forceOpen && "flex h-full min-h-0 flex-col"
      )}
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      {!forceOpen && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors"
          style={{ color: "var(--ink-strong)" }}
        >
          <div className="flex items-center gap-2">
            <GalleryHorizontalEndIcon
              className="size-4"
              style={{ color: "var(--ink-soft)" }}
            />
            <span className="font-ko text-[13px] font-medium">{labels.heading}</span>
            <span className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
              {template(labels.countSuffixTemplate, { n: GALLERY_IMAGES.length })}
            </span>
          </div>
          <ChevronDownIcon
            className={cn("size-4 transition-transform", expanded && "rotate-180")}
            style={{ color: "var(--ink-soft)" }}
          />
        </button>
      )}

      {open && (
        <div
          className={cn(
            forceOpen
              ? "flex min-h-0 flex-1 flex-col px-4 pb-3 pt-3"
              : "border-t px-4 pb-3 pt-3"
          )}
          style={{ borderColor: "var(--border)" }}
        >
          {!controlled && (
            <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1">
              <CategoryChip
                active={category === "all"}
                onClick={() => setCategory("all")}
                label={labels.categoryAll}
              />
              {GALLERY_CATEGORIES.map((cat) => (
                <CategoryChip
                  key={cat}
                  active={category === cat}
                  onClick={() => setCategory(cat)}
                  label={labels.categoryByKey[cat]}
                />
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <div
              className="py-8 text-center font-body text-[12px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {labels.empty}
            </div>
          ) : (
            <div
              ref={gridRef}
              className={cn(
                "grid grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3",
                forceOpen && "min-h-0 flex-1"
              )}
              style={
                forceOpen
                  ? { gridAutoRows: "min-content", alignContent: "start" }
                  : { maxHeight: "180px", gridAutoRows: "min-content", alignContent: "start" }
              }
            >
              {filtered.map((img) => {
                const isSelected = selectedImageId === img.id;
                return (
                  <button
                    type="button"
                    key={img.id}
                    onClick={() => onSelect(img)}
                    className={galleryTileClass}
                    style={galleryTileStyle(isSelected)}
                  >
                    <div className="relative aspect-video overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.thumbnailUrl}
                        loading="lazy"
                        decoding="async"
                        alt={labels.titles[img.id]}
                        className="size-full object-cover"
                      />
                    </div>
                    <div className="px-2 py-1.5">
                      <p
                        className="truncate font-body text-[11px] font-medium"
                        style={{ color: "var(--ink-strong)" }}
                      >
                        {labels.titles[img.id]}
                      </p>
                    </div>
                    {isSelected && <TileSelectionMark />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[5px] border px-2 py-0.5 font-body text-[10.5px] transition-colors"
      style={{
        background: "var(--surface-2)",
        borderColor: active ? "var(--emphasis)" : "var(--border)",
        color: active ? "var(--ink-strong)" : "var(--ink)",
      }}
    >
      {label}
    </button>
  );
}
