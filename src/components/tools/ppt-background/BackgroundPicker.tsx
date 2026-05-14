"use client";

import { ImageIcon, UploadCloudIcon, XIcon } from "lucide-react";
import { FileUpload } from "@/components/common/FileUpload";
import { InlineGallery } from "@/components/ppt/InlineGallery";
import type { GalleryImage } from "@/lib/gallery/types";
import type { GalleryCategory } from "@/lib/gallery/types";

const IMAGE_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

interface BackgroundPickerProps {
  bgFile: File | null;
  bgPreviewUrl: string | null;
  galleryImage: GalleryImage | null;
  onDirectUpload: (files: File[]) => void;
  onGallerySelect: (img: GalleryImage) => void;
  onClear: () => void;
  labels: {
    heading: string;
    previewLabel: string;
    empty: string;
    fromGallery: string;
    fromUpload: string;
    clear: string;
    uploadLabel: string;
    uploadHint: string;
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
  bgFile,
  bgPreviewUrl,
  galleryImage,
  onDirectUpload,
  onGallerySelect,
  onClear,
  labels,
}: BackgroundPickerProps) {
  return (
    <div className="space-y-3">
      <div
        className="font-display text-[12px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--ink-soft)" }}
      >
        {labels.heading}
      </div>

      {/* Preview card */}
      <div
        className="overflow-hidden rounded-[8px] border"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div
          className="border-b px-3 py-1.5 font-body text-[11px]"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--ink-soft)" }}
        >
          {labels.previewLabel}
        </div>
        <div
          className="relative flex aspect-video items-center justify-center"
          style={{ background: "var(--surface-2)" }}
        >
          {bgPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bgPreviewUrl}
              alt="background preview"
              className="size-full object-contain"
            />
          ) : (
            <span className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
              {labels.empty}
            </span>
          )}
        </div>
      </div>

      {/* Selected meta + clear */}
      {bgFile && (
        <div
          className="flex items-center gap-2 rounded-[6px] border px-3 py-2"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
        >
          {galleryImage ? (
            <ImageIcon className="size-4" style={{ color: "var(--accent-electric)" }} />
          ) : (
            <UploadCloudIcon className="size-4" style={{ color: "var(--accent-electric)" }} />
          )}
          <div className="min-w-0 flex-1">
            <p
              className="truncate font-display text-[11.5px] font-medium"
              style={{ color: "var(--ink-strong)" }}
            >
              {galleryImage ? galleryImage.title : bgFile.name}
            </p>
            <p className="truncate font-body text-[10.5px]" style={{ color: "var(--ink-soft)" }}>
              {galleryImage ? labels.fromGallery : labels.fromUpload}
            </p>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="rounded p-1 transition-colors hover:bg-[color:var(--surface)]"
            aria-label={labels.clear}
          >
            <XIcon className="size-4" style={{ color: "var(--ink-soft)" }} />
          </button>
        </div>
      )}

      {/* Direct upload — compact, only when no background is selected */}
      {!bgFile && (
        <FileUpload
          accept={IMAGE_ACCEPT}
          multiple={false}
          onFiles={onDirectUpload}
          label={labels.uploadLabel}
          description={labels.uploadHint}
        />
      )}

      {/* Gallery (collapses when a background is selected) */}
      <InlineGallery
        onSelect={onGallerySelect}
        selectedImageId={galleryImage?.id}
        forceCollapsed={!!bgFile}
        labels={labels.gallery}
      />
    </div>
  );
}
