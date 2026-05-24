"use client";

import { useState, type ReactNode } from "react";
import { ImageIcon, UploadCloudIcon, XIcon } from "lucide-react";
import { FileUpload } from "@/components/common/FileUpload";
import { InlineGallery } from "@/components/ppt/InlineGallery";
import type { GalleryImage, GalleryCategory } from "@/lib/gallery/types";

const IMAGE_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

type BgSource = "upload" | "gallery";

interface BackgroundPickerProps {
  bgFile: File | null;
  bgPreviewUrl: string | null;
  galleryImage: GalleryImage | null;
  onDirectUpload: (files: File[]) => void;
  onGallerySelect: (img: GalleryImage) => void;
  onClear: () => void;
  /**
   * Action area to render to the right of the Preview card in Row 1
   * (Apply button, ProcessingStatus, etc). Composed by the parent so this
   * component stays presentational.
   */
  actionSlot?: ReactNode;
  labels: {
    heading: string;
    previewLabel: string;
    empty: string;
    fromGallery: string;
    fromUpload: string;
    clear: string;
    uploadLabel: string;
    uploadHint: string;
    sourceUpload: string;
    sourceGallery: string;
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
  actionSlot,
  labels,
}: BackgroundPickerProps) {
  const [source, setSource] = useState<BgSource>("gallery");

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      {/* Row 1: Preview (left, 240×135) + right column (Action fixed-height + Toggle) */}
      <div className="flex shrink-0 items-start gap-3">
        {/* Preview card — 240×135 (16:9) */}
        <div
          className="shrink-0 overflow-hidden rounded-[8px] border"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            width: "240px",
          }}
        >
          <div
            className="relative aspect-video overflow-hidden"
            style={{ background: "var(--surface-2)" }}
          >
            {bgPreviewUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bgPreviewUrl}
                  alt="background preview"
                  className="size-full object-cover"
                />
                <div
                  className="absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-2.25rem)] items-center gap-1.5 rounded-[4px] px-2 py-0.5"
                  style={{
                    background: "color-mix(in oklch, var(--surface) 78%, transparent)",
                    backdropFilter: "blur(4px)",
                    WebkitBackdropFilter: "blur(4px)",
                  }}
                >
                  {galleryImage ? (
                    <ImageIcon
                      className="size-3 shrink-0"
                      style={{ color: "var(--accent-electric)" }}
                    />
                  ) : (
                    <UploadCloudIcon
                      className="size-3 shrink-0"
                      style={{ color: "var(--accent-electric)" }}
                    />
                  )}
                  <span
                    className="truncate font-display text-[10.5px] font-medium"
                    style={{ color: "var(--ink-strong)" }}
                  >
                    {galleryImage?.title ?? bgFile?.name ?? ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onClear}
                  aria-label={labels.clear}
                  className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full transition-colors"
                  style={{
                    background: "color-mix(in oklch, var(--surface) 78%, transparent)",
                    backdropFilter: "blur(4px)",
                    WebkitBackdropFilter: "blur(4px)",
                  }}
                >
                  <XIcon className="size-3" style={{ color: "var(--ink-strong)" }} />
                </button>
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <span className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
                  {labels.empty}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right column of Row 1 */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* Action area — FIXED 100px so swapped states never resize the row */}
          <div className="shrink-0 overflow-hidden" style={{ height: "100px" }}>
            {actionSlot}
          </div>
          {/* Compact Upload/Gallery toggle */}
          <div
            className="flex shrink-0 overflow-hidden rounded-[6px] border"
            style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
          >
            {(["upload", "gallery"] as const).map((src) => {
              const active = source === src;
              const label = src === "upload" ? labels.sourceUpload : labels.sourceGallery;
              return (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSource(src)}
                  className="flex-1 py-1.5 font-display text-[11.5px] font-medium transition-colors"
                  style={{
                    background: active ? "var(--surface)" : "transparent",
                    color: active ? "var(--ink-strong)" : "var(--ink-soft)",
                    boxShadow: active ? "inset 0 -2px 0 var(--ink-strong)" : undefined,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Source body — flex-1, fills remaining panel height */}
      <div className="flex min-h-0 flex-1 flex-col">
        {source === "upload" ? (
          <FileUpload
            accept={IMAGE_ACCEPT}
            multiple={false}
            onFiles={onDirectUpload}
            label={labels.uploadLabel}
            description={labels.uploadHint}
            hideFileList
          />
        ) : (
          <InlineGallery
            onSelect={onGallerySelect}
            selectedImageId={galleryImage?.id}
            forceOpen
            labels={labels.gallery}
          />
        )}
      </div>
    </div>
  );
}
