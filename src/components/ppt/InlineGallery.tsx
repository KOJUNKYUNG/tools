"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckIcon, ChevronDownIcon, GalleryHorizontalEndIcon } from "lucide-react";
import { MOCK_IMAGES } from "@/lib/gallery/mockData";
import {
  GALLERY_CATEGORIES,
  type GalleryCategory,
  type GalleryImage,
} from "@/lib/gallery/types";
import { cn } from "@/lib/utils";
import { template } from "@/lib/common/template";

type CategoryFilter = "all" | GalleryCategory;

interface InlineGalleryProps {
  onSelect: (image: GalleryImage) => void;
  selectedImageId?: string | null;
  forceCollapsed?: boolean;
  /** When true, render in always-open mode without the collapsible header. */
  forceOpen?: boolean;
  labels: {
    heading: string;            // "배경 갤러리" / "Background gallery"
    countSuffixTemplate: string;  // e.g. "({n}개 이미지)"
    categoryAll: string;
    categoryByKey: Record<GalleryCategory, string>;
    empty: string;
  };
}

export function InlineGallery({
  onSelect,
  selectedImageId,
  forceCollapsed,
  forceOpen = false,
  labels,
}: InlineGalleryProps) {
  const [expanded, setExpanded] = useState(false);
  const [category, setCategory] = useState<CategoryFilter>("all");

  useEffect(() => {
    if (forceCollapsed) setExpanded(false);
  }, [forceCollapsed]);

  const filtered = useMemo(() => {
    if (category === "all") return MOCK_IMAGES;
    return MOCK_IMAGES.filter((img) => img.category === category);
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
              style={{ color: "var(--accent-electric)" }}
            />
            <span className="font-display text-[13px] font-medium">{labels.heading}</span>
            <span className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
              {template(labels.countSuffixTemplate, { n: MOCK_IMAGES.length })}
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

          {filtered.length === 0 ? (
            <div
              className="py-8 text-center font-body text-[12px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {labels.empty}
            </div>
          ) : (
            <div
              className={cn(
                "grid grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3",
                forceOpen && "min-h-0 flex-1"
              )}
              style={forceOpen ? undefined : { maxHeight: "180px" }}
            >
              {filtered.map((img) => {
                const isSelected = selectedImageId === img.id;
                return (
                  <button
                    type="button"
                    key={img.id}
                    onClick={() => onSelect(img)}
                    className="group relative overflow-hidden rounded-[6px] border text-left transition-colors"
                    style={{
                      background: "var(--surface-2)",
                      borderColor: isSelected ? "var(--accent-electric)" : "var(--border)",
                      borderWidth: isSelected ? 2 : 1,
                    }}
                  >
                    <div className="relative aspect-video overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.thumbnailUrl}
                        alt={img.title}
                        className="size-full object-cover"
                      />
                      {isSelected && (
                        <div
                          className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full"
                          style={{ background: "var(--accent-electric)", color: "#fff" }}
                        >
                          <CheckIcon className="size-3" />
                        </div>
                      )}
                    </div>
                    <div className="px-2 py-1.5">
                      <p
                        className="truncate font-display text-[11px] font-medium"
                        style={{ color: "var(--ink-strong)" }}
                      >
                        {img.title}
                      </p>
                    </div>
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
        background: active ? "var(--surface)" : "var(--surface-2)",
        borderColor: active ? "var(--accent-electric)" : "var(--border)",
        color: active ? "var(--ink-strong)" : "var(--ink)",
        boxShadow: active ? "inset 0 -2px 0 var(--accent-electric)" : undefined,
      }}
    >
      {label}
    </button>
  );
}
