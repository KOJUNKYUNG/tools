"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GalleryHorizontalEndIcon,
  PaintbrushIcon,
  ChevronDownIcon,
  XIcon,
} from "lucide-react";
import { MOCK_IMAGES, getAllTags } from "@/lib/gallery/mockData";
import {
  GALLERY_CATEGORIES,
  CATEGORY_LABEL,
  type GalleryCategory,
  type GalleryImage,
} from "@/lib/gallery/types";
import { cn } from "@/lib/utils";

const ALL_TAGS = getAllTags();

interface InlineGalleryProps {
  onSelect: (image: GalleryImage) => void;
  selectedImageId?: string | null;
  forceCollapsed?: boolean;
}

export function InlineGallery({ onSelect, selectedImageId, forceCollapsed }: InlineGalleryProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (forceCollapsed) setExpanded(false);
  }, [forceCollapsed]);
  const [category, setCategory] = useState<GalleryCategory | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const filteredImages = useMemo(() => {
    return MOCK_IMAGES.filter((img) => {
      if (category && img.category !== category) return false;
      if (selectedTags.size > 0) {
        return img.tags.some((t) => selectedTags.has(t));
      }
      return true;
    });
  }, [category, selectedTags]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setCategory(null);
    setSelectedTags(new Set());
  }, []);

  const hasFilters = category !== null || selectedTags.size > 0;

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex items-center gap-2">
          <GalleryHorizontalEndIcon className="size-5 text-primary" />
          <span className="text-sm font-medium">배경 이미지 갤러리</span>
          <span className="text-xs text-muted-foreground">
            ({MOCK_IMAGES.length}개 이미지)
          </span>
        </div>
        <ChevronDownIcon
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="border-t px-4 pb-4 pt-3">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCategory(null)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                category === null
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted",
              )}
            >
              전체
            </button>
            {GALLERY_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat === category ? null : cat)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  category === cat
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted",
                )}
              >
                {CATEGORY_LABEL[cat]}
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-1">
            {ALL_TAGS.map((tag) => (
              <Badge
                key={tag}
                variant={selectedTags.has(tag) ? "default" : "outline"}
                className="cursor-pointer select-none text-[10px]"
                onClick={() => toggleTag(tag)}
              >
                #{tag}
              </Badge>
            ))}
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-1 flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-2.5" />
                초기화
              </button>
            )}
          </div>

          {filteredImages.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              검색 결과가 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filteredImages.map((img) => {
                const isSelected = selectedImageId === img.id;
                return (
                  <div
                    key={img.id}
                    className={cn(
                      "group relative overflow-hidden rounded-lg border transition-all",
                      isSelected
                        ? "ring-2 ring-primary ring-offset-2"
                        : "hover:shadow-md",
                    )}
                  >
                    <div className="relative aspect-video overflow-hidden">
                      <Image
                        src={img.thumbnailUrl}
                        alt={img.title}
                        fill
                        sizes="(max-width: 640px) 50vw, 33vw"
                        className="object-cover transition-transform group-hover:scale-105"
                        unoptimized
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                        <Button
                          size="sm"
                          variant={isSelected ? "secondary" : "default"}
                          className="translate-y-1 text-xs opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100"
                          onClick={() => onSelect(img)}
                        >
                          <PaintbrushIcon className="size-3" />
                          {isSelected ? "선택됨" : "선택"}
                        </Button>
                      </div>
                    </div>
                    <div className="p-2">
                      <p className="truncate text-xs font-medium">{img.title}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {CATEGORY_LABEL[img.category]}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
