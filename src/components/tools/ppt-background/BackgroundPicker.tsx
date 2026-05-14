"use client";

import { useState } from "react";
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
  labels,
}: BackgroundPickerProps) {
  const [source, setSource] = useState<BgSource>("gallery");

  return (
    <div className="space-y-3">
      {/* Top row: toggle (flex-fill) + preview (fixed) */}
      <div className="flex items-start gap-3">
        {/* Source segmented toggle */}
        <div
          className="flex flex-1 self-stretch overflow-hidden rounded-[6px] border"
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
                className="flex-1 font-display text-[12px] font-medium transition-colors"
                style={{
                  background: active ? "var(--surface)" : "transparent",
                  color: active ? "var(--ink-strong)" : "var(--ink-soft)",
                  boxShadow: active ? "inset 0 -2px 0 var(--accent-electric)" : undefined,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Preview card — fixed 160×90 (16:9) at the right edge */}
        <div
          className="shrink-0 overflow-hidden rounded-[8px] border"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            width: "160px",
          }}
        >
          <div
            className="relative flex items-center justify-center"
            style={{ background: "var(--surface-2)", height: "90px" }}
          >
            {bgPreviewUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bgPreviewUrl}
                  alt="background preview"
                  className="size-full object-contain"
                />
                {bgFile && (
                  <>
                    <div
                      className="absolute bottom-1 left-1 flex max-w-[calc(100%-1.75rem)] items-center gap-1 rounded-[3px] px-1.5 py-0.5"
                      style={{
                        background: "color-mix(in oklch, var(--surface) 78%, transparent)",
                        backdropFilter: "blur(4px)",
                        WebkitBackdropFilter: "blur(4px)",
                      }}
                    >
                      {galleryImage ? (
                        <ImageIcon
                          className="size-2.5 shrink-0"
                          style={{ color: "var(--accent-electric)" }}
                        />
                      ) : (
                        <UploadCloudIcon
                          className="size-2.5 shrink-0"
                          style={{ color: "var(--accent-electric)" }}
                        />
                      )}
                      <span
                        className="truncate font-display text-[9.5px] font-medium"
                        style={{ color: "var(--ink-strong)" }}
                      >
                        {galleryImage ? galleryImage.title : bgFile.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={onClear}
                      aria-label={labels.clear}
                      className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full transition-colors"
                      style={{
                        background: "color-mix(in oklch, var(--surface) 78%, transparent)",
                        backdropFilter: "blur(4px)",
                        WebkitBackdropFilter: "blur(4px)",
                      }}
                    >
                      <XIcon className="size-2.5" style={{ color: "var(--ink-strong)" }} />
                    </button>
                  </>
                )}
              </>
            ) : (
              <span className="font-body text-[10.5px]" style={{ color: "var(--ink-soft)" }}>
                {labels.empty}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Source body (full width) */}
      {source === "upload" ? (
        <FileUpload
          accept={IMAGE_ACCEPT}
          multiple={false}
          onFiles={onDirectUpload}
          label={labels.uploadLabel}
          description={labels.uploadHint}
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
  );
}
