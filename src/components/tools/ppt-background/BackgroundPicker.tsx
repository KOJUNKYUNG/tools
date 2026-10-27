"use client";

import { useRef, useState } from "react";
import { CropSelector } from "@/components/image/CropSelector";
import { InlineGallery, type GalleryLabels } from "@/components/ppt/InlineGallery";
import type { Dictionary } from "@/i18n/config";
import type { CropRect } from "@/lib/image/maxFitCrop";
import {
  GALLERY_CATEGORIES,
  type GalleryCategory,
  type GalleryImage,
} from "@/lib/gallery/types";
import type { FillBackground } from "@/lib/ppt/changeBackground";
import { SolidColourGrid, type SolidColourLabels } from "./SolidColourGrid";

/** A gallery filter, or the "단색" tab after them. */
type CategoryFilter = "all" | GalleryCategory | "solid";

/** The frame over the picked picture, shown in place of the gallery. */
export interface BackgroundFrame {
  imageUrl: string;
  /** The slide's width / height: the frame's locked aspect. */
  ratio: number;
  /** The frame set before, kept when the user comes back to this picture. */
  crop: CropRect | null;
  onCropChange: (crop: CropRect) => void;
  onBack: () => void;
  /** A run is using the frame: it is shown as is and nothing here responds. */
  locked: boolean;
}

interface BackgroundPickerProps {
  galleryImage: GalleryImage | null;
  onGallerySelect: (img: GalleryImage) => void;
  onDirectUpload: (files: File[]) => void;
  /** A picked file is still being prepared (HEIC conversion). */
  uploadBusy?: boolean;
  /** When set, the frame replaces the category tabs and the gallery. */
  frame?: BackgroundFrame | null;
  /** The picked solid colour or "no background". */
  fill: FillBackground | null;
  onFillSelect: (fill: FillBackground) => void;
  /** The colour "no background" shows on this deck (`#rrggbb`). */
  themeBackground: string;
  /** A run is using the picked fill: the "단색" tab shows it and nothing responds. */
  fillLocked: boolean;
  labels: {
    uploadLabel: string;
    backToGallery: string;
    pictureAlt: string;
    handles: Dictionary["common"]["resizeHandles"];
    gallery: GalleryLabels;
    solid: SolidColourLabels & { tab: string };
  };
}

export function BackgroundPicker({
  galleryImage,
  onGallerySelect,
  onDirectUpload,
  uploadBusy = false,
  frame = null,
  fill,
  onFillSelect,
  themeBackground,
  fillLocked,
  labels,
}: BackgroundPickerProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  // A run holding a fill shows it, as a picture run shows its locked frame
  // (a gallery left open under it would take a new pick), and the tab stays
  // after the run, where the kept pick is.
  if (fillLocked && activeCategory !== "solid") setActiveCategory("solid");
  /** The last "직접 선택" colour, kept while other tiles or tabs are picked. */
  const [custom, setCustom] = useState<string | null>(null);
  const [customPicked, setCustomPicked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      {/* Header row: category tabs (left) + text-only upload button (right) */}
      <div
        className="flex shrink-0 items-center justify-between gap-2 border-b"
        style={{ borderColor: "var(--hairline)" }}
      >
        {frame ? (
          <button
            type="button"
            onClick={frame.onBack}
            disabled={frame.locked}
            className="subtle-action mb-1 flex shrink-0 items-center gap-1 rounded-[5px] px-2 py-1.5 font-body text-[11px]"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5 L8 12 L15 19" />
            </svg>
            {labels.backToGallery}
          </button>
        ) : (
          <div className="flex min-w-0 gap-0.5">
            <CategoryTab
              active={activeCategory === "all"}
              onClick={() => setActiveCategory("all")}
              label={labels.gallery.categoryAll}
              disabled={fillLocked}
            />
            {GALLERY_CATEGORIES.map((cat) => (
              <CategoryTab
                key={cat}
                active={activeCategory === cat}
                onClick={() => setActiveCategory(cat)}
                label={labels.gallery.categoryByKey[cat]}
                disabled={fillLocked}
              />
            ))}
            <CategoryTab
              active={activeCategory === "solid"}
              onClick={() => setActiveCategory("solid")}
              label={labels.solid.tab}
              disabled={fillLocked}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploadBusy || !!frame?.locked || fillLocked}
          aria-busy={uploadBusy}
          className="subtle-action mb-1 shrink-0 rounded-[5px] px-2.5 py-1.5 font-body text-[11px]"
        >
          {labels.uploadLabel}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/heic,image/heif,.heic,.heif"
          className="hidden"
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            if (files.length) onDirectUpload(files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Frame over the picked picture, or the gallery grid — either fills
          the remaining panel height, so switching never resizes the tool. */}
      <div className="min-h-0 flex-1">
        {frame ? (
          // Keyed by picture: a new picture starts from the centred frame.
          <CropSelector
            key={frame.imageUrl}
            imageUrl={frame.imageUrl}
            alt={labels.pictureAlt}
            targetWidth={frame.ratio}
            targetHeight={1}
            initialCrop={frame.crop}
            onCropChange={frame.onCropChange}
            handleLabels={labels.handles}
            readOnly={frame.locked}
          />
        ) : activeCategory === "solid" ? (
          <SolidColourGrid
            value={fill}
            onSelect={(next, fromCustom) => {
              setCustomPicked(fromCustom);
              onFillSelect(next);
            }}
            themeBackground={themeBackground}
            custom={custom}
            customPicked={customPicked}
            onCustom={setCustom}
            locked={fillLocked}
            labels={labels.solid}
          />
        ) : (
          <InlineGallery
            onSelect={onGallerySelect}
            selectedImageId={galleryImage?.id}
            forceOpen
            category={activeCategory}
            labels={labels.gallery}
          />
        )}
      </div>
    </div>
  );
}

function CategoryTab({
  active,
  onClick,
  label,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
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
