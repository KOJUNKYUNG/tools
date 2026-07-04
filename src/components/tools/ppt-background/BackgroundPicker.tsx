"use client";

import { useRef, useState } from "react";
import { InlineGallery } from "@/components/ppt/InlineGallery";
import {
  GALLERY_CATEGORIES,
  type GalleryCategory,
  type GalleryImage,
} from "@/lib/gallery/types";

type CategoryFilter = "all" | GalleryCategory;

interface BackgroundPickerProps {
  galleryImage: GalleryImage | null;
  onGallerySelect: (img: GalleryImage) => void;
  onDirectUpload: (files: File[]) => void;
  labels: {
    uploadLabel: string;
    gallery: {
      heading: string;
      countSuffixTemplate: string;
      categoryAll: string;
      categoryByKey: Record<GalleryCategory, string>;
      empty: string;
    };
  };
}

export function BackgroundPicker({
  galleryImage,
  onGallerySelect,
  onDirectUpload,
  labels,
}: BackgroundPickerProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      {/* Header row: category tabs (left) + text-only upload button (right) */}
      <div
        className="flex shrink-0 items-center justify-between gap-2 border-b"
        style={{ borderColor: "var(--hairline)" }}
      >
        <div className="flex min-w-0 gap-0.5">
          <CategoryTab
            active={activeCategory === "all"}
            onClick={() => setActiveCategory("all")}
            label={labels.gallery.categoryAll}
          />
          {GALLERY_CATEGORIES.map((cat) => (
            <CategoryTab
              key={cat}
              active={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
              label={labels.gallery.categoryByKey[cat]}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mb-1 inline-flex shrink-0 items-center rounded-[6px] border px-2.5 py-1.5 font-body text-[11px] transition-colors hover:border-[color:var(--emphasis)]"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--ink-strong)",
          }}
        >
          {labels.uploadLabel}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            if (files.length) onDirectUpload(files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Gallery grid — fills remaining panel height */}
      <div className="min-h-0 flex-1">
        <InlineGallery
          onSelect={onGallerySelect}
          selectedImageId={galleryImage?.id}
          forceOpen
          category={activeCategory}
          labels={labels.gallery}
        />
      </div>
    </div>
  );
}

function CategoryTab({
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
      className="border-b-2 px-2 py-1.5 font-body text-[11.5px] font-medium transition-colors"
      style={{
        color: active ? "var(--ink-strong)" : "var(--ink-soft)",
        borderBottomColor: active ? "var(--emphasis)" : "transparent",
      }}
    >
      {label}
    </button>
  );
}
