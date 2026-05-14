"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileIcon, Layers, UploadCloud } from "lucide-react";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { PageRangeSelector } from "@/components/common/PageRangeSelector";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import {
  changeBackground,
  type BgMode,
} from "@/lib/ppt/changeBackground";
import {
  extractCurrentBackgrounds,
  type SlideBackground,
} from "@/lib/ppt/extractCurrentBackgrounds";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import type { GalleryImage, GalleryCategory } from "@/lib/gallery/types";
import { ModeSelector } from "./ModeSelector";
import { SlideThumbStrip } from "./SlideThumbStrip";
import { BackgroundPicker } from "./BackgroundPicker";
import { PptConversionGuide, type ConversionMethodLabels } from "./PptConversionGuide";

const PPTX_ACCEPT = {
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.ms-powerpoint": [".ppt"],
};

export interface PptBackgroundToolLabels {
  header: { title: string; description: string };
  upload: { dropzoneLabel: string; dropzoneHint: string; pptDetected: string };
  conversion: { heading: string; note: string; methods: ConversionMethodLabels[] };
  fileStatus: { slideCount: (n: number) => string; changeFile: string; analyzing: string };
  mode: {
    label: string;
    optionAll: string;
    optionMaster: string;
    optionSpecific: string;
    masterNote: string;
    specificInput: string;
    specificSelectAll: string;
    specificClear: string;
    specificHint: string;
  };
  thumbnails: {
    heading: string;
    empty: string;
    sourceByKey: Record<"slide" | "layout" | "master", string>;
  };
  background: {
    heading: string;
    preview: string;
    empty: string;
    fromGallery: string;
    fromUpload: string;
    clear: string;
    uploadLabel: string;
    uploadHint: string;
  };
  gallery: {
    heading: string;
    countSuffix: (n: number) => string;
    categoryAll: string;
    categoryByKey: Record<GalleryCategory, string>;
    empty: string;
  };
  action: {
    apply: string;
    applyDisabledHint: string;
    specificEmpty: string;
  };
  processing: {
    processing: string;
    done: string;
    doneBody: string;
    download: string;
    error: string;
    errorBody: string;
    retry: string;
    reset: string;
  };
}

interface PptBackgroundToolProps {
  labels: PptBackgroundToolLabels;
}

export function PptBackgroundTool({ labels }: PptBackgroundToolProps) {
  const [showConversionGuide, setShowConversionGuide] = useState(false);
  const [bgFiles, setBgFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<BgMode>("all-slides");
  const [selectedSlides, setSelectedSlides] = useState<Set<number>>(new Set());
  const [galleryImage, setGalleryImage] = useState<GalleryImage | null>(null);
  const [currentBgs, setCurrentBgs] = useState<SlideBackground[]>([]);
  const [bgLoading, setBgLoading] = useState(false);
  const [bgObjectUrls, setBgObjectUrls] = useState<Map<number, string>>(new Map());
  const [bgPreviewUrl, setBgPreviewUrl] = useState<string | null>(null);

  const bgFile = bgFiles[0] ?? null;
  const objectUrlsRef = useRef(bgObjectUrls);
  objectUrlsRef.current = bgObjectUrls;

  const {
    files: pptxFiles,
    setFiles: setPptxFilesRaw,
    status,
    progress,
    errorMessage,
    run,
    retry,
    download,
  } = useToolProcessor<Uint8Array>({
    processor: (files, onProgress) =>
      changeBackground({
        pptxFile: files[0],
        bgImage: bgFile!,
        mode,
        targetSlides:
          mode === "specific-slides" ? [...selectedSlides].sort((a, b) => a - b) : undefined,
        onProgress,
      }),
    onDownload: (bytes) => {
      const baseName = pptxFiles[0]?.name.replace(/\.pptx?$/i, "") ?? "presentation";
      downloadBlob(
        bytes,
        `${baseName}-bg-changed.pptx`,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      );
    },
  });

  const pptxFile = pptxFiles[0] ?? null;

  // .ppt vs .pptx routing — .ppt never enters useToolProcessor state.
  const setPptxFiles = useCallback(
    (files: File[]) => {
      const first = files[0];
      if (first && first.name.toLowerCase().endsWith(".ppt")) {
        setShowConversionGuide(true);
        setPptxFilesRaw([]);
        return;
      }
      setShowConversionGuide(false);
      setPptxFilesRaw(files);
    },
    [setPptxFilesRaw],
  );

  // Extract current backgrounds when a .pptx is loaded.
  useEffect(() => {
    if (!pptxFile) {
      setCurrentBgs([]);
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      setBgObjectUrls(new Map());
      return;
    }
    setBgLoading(true);
    let cancelled = false;
    extractCurrentBackgrounds(pptxFile)
      .then((bgs) => {
        if (cancelled) return;
        setCurrentBgs(bgs);
        const urls = new Map<number, string>();
        for (const bg of bgs) {
          if (bg.imageBlob) urls.set(bg.slideIndex, URL.createObjectURL(bg.imageBlob));
        }
        objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        setBgObjectUrls(urls);
      })
      .catch(() => {
        if (!cancelled) setCurrentBgs([]);
      })
      .finally(() => {
        if (!cancelled) setBgLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pptxFile]);

  // Cleanup all object URLs on unmount.
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      if (bgPreviewUrl && bgPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(bgPreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGallerySelect = useCallback(
    async (image: GalleryImage) => {
      setGalleryImage(image);
      if (bgPreviewUrl && bgPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(bgPreviewUrl);
      setBgPreviewUrl(image.thumbnailUrl);
      try {
        const res = await fetch(image.url);
        const blob = await res.blob();
        const ext = image.url.includes("png") || image.url.startsWith("data:image/svg") ? "png" : "jpg";
        const file = new File([blob], `gallery-${image.id}.${ext}`, {
          type: ext === "png" ? "image/png" : "image/jpeg",
        });
        setBgFiles([file]);
      } catch {
        setGalleryImage(null);
        setBgPreviewUrl(null);
      }
    },
    [bgPreviewUrl],
  );

  const handleDirectUpload = useCallback(
    (files: File[]) => {
      setBgFiles(files);
      setGalleryImage(null);
      if (bgPreviewUrl && bgPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(bgPreviewUrl);
      setBgPreviewUrl(files[0] ? URL.createObjectURL(files[0]) : null);
    },
    [bgPreviewUrl],
  );

  const clearBgSelection = useCallback(() => {
    setGalleryImage(null);
    setBgFiles([]);
    if (bgPreviewUrl && bgPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(bgPreviewUrl);
    setBgPreviewUrl(null);
  }, [bgPreviewUrl]);

  const totalSlides = currentBgs.length;
  const specificValid = mode !== "specific-slides" || selectedSlides.size > 0;
  const canRun = !!pptxFile && !!bgFile && specificValid && status === "idle";

  const applyDisabledLabel = useMemo(() => {
    if (!bgFile) return labels.action.applyDisabledHint;
    if (mode === "specific-slides" && selectedSlides.size === 0) return labels.action.specificEmpty;
    return null;
  }, [bgFile, mode, selectedSlides.size, labels]);

  const onReset = useCallback(() => {
    retry();
    setPptxFilesRaw([]);
    setShowConversionGuide(false);
    setBgFiles([]);
    setGalleryImage(null);
    setMode("all-slides");
    setSelectedSlides(new Set());
    if (bgPreviewUrl && bgPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(bgPreviewUrl);
    setBgPreviewUrl(null);
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    setBgObjectUrls(new Map());
    setCurrentBgs([]);
    setBgLoading(false);
  }, [retry, setPptxFilesRaw, bgPreviewUrl]);

  // ───────── Render ─────────
  return (
    <div
      className="overflow-hidden rounded-[14px] border"
      style={{
        background: "color-mix(in oklch, var(--surface) 92%, transparent)",
        backdropFilter: "blur(10px) saturate(1.1)",
        WebkitBackdropFilter: "blur(10px) saturate(1.1)",
        borderColor: "var(--border)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 48px -16px rgba(20,30,60,0.28), 0 8px 20px -6px rgba(20,30,60,0.16)",
      }}
    >
      {/* Header strip */}
      <div
        className="flex items-start gap-3 border-b px-6 pt-5 pb-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-[5px]"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--ink-strong)",
          }}
        >
          <Layers size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="font-display text-[16px] font-semibold leading-[1.2] tracking-[0.005em] font-ko"
            style={{ color: "var(--headline)" }}
          >
            {labels.header.title}
          </div>
          <div
            className="mt-1 font-body text-[12px] leading-[1.45]"
            style={{ color: "var(--ink)" }}
          >
            {labels.header.description}
          </div>
        </div>
      </div>

      {/* Body */}
      {!pptxFile ? (
        // Empty state — centered dropzone, optional conversion guide below.
        <div className="space-y-4 px-6 py-6">
          {showConversionGuide && (
            <div
              className="rounded-[6px] border px-3 py-2 font-body text-[11.5px]"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border)",
                color: "var(--ink-strong)",
              }}
            >
              {labels.upload.pptDetected}
            </div>
          )}
          <FileUpload
            accept={PPTX_ACCEPT}
            multiple={false}
            onFiles={setPptxFiles}
            label={labels.upload.dropzoneLabel}
            description={labels.upload.dropzoneHint}
          />
          {showConversionGuide && (
            <PptConversionGuide
              heading={labels.conversion.heading}
              methods={labels.conversion.methods}
              note={labels.conversion.note}
            />
          )}
        </div>
      ) : (
        // Two-pane workspace.
        <div
          className="grid"
          style={{
            gridTemplateColumns: "1fr 1px 1fr",
          }}
        >
          {/* LEFT panel */}
          <div className="space-y-4 px-6 py-5">
            {/* File status */}
            <div
              className="flex items-center gap-3 rounded-[8px] border px-3 py-2.5"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
            >
              <FileIcon className="size-4 shrink-0" style={{ color: "var(--accent-electric)" }} />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate font-display text-[12px] font-medium"
                  style={{ color: "var(--ink-strong)" }}
                >
                  {pptxFile.name}
                </p>
                <p className="font-body text-[10.5px]" style={{ color: "var(--ink-soft)" }}>
                  {totalSlides > 0
                    ? labels.fileStatus.slideCount(totalSlides)
                    : labels.fileStatus.analyzing}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPptxFiles([])}
                className="rounded-[5px] border px-2 py-1 font-body text-[10.5px] transition-colors hover:border-[color:var(--accent-electric)]"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--ink-strong)",
                }}
              >
                {labels.fileStatus.changeFile}
              </button>
            </div>

            {/* Mode + range selector + thumb strip */}
            <div className="space-y-3">
              <ModeSelector
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  if (next !== "specific-slides") setSelectedSlides(new Set());
                }}
                labels={labels.mode}
              />

              {mode === "specific-slides" ? (
                <PageRangeSelector
                  totalPages={totalSlides}
                  selected={selectedSlides}
                  onChange={setSelectedSlides}
                  inputPlaceholder={labels.mode.specificInput}
                  selectAllLabel={labels.mode.specificSelectAll}
                  clearLabel={labels.mode.specificClear}
                >
                  <p
                    className="font-body text-[10.5px]"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {labels.mode.specificHint}
                  </p>
                  <SlideThumbStrip
                    backgrounds={currentBgs}
                    thumbnailUrls={bgObjectUrls}
                    selectable={{
                      selected: selectedSlides,
                      onToggle: (n) => {
                        setSelectedSlides((prev) => {
                          const next = new Set(prev);
                          if (next.has(n)) next.delete(n);
                          else next.add(n);
                          return next;
                        });
                      },
                    }}
                    labels={{
                      emptyThumb: labels.thumbnails.empty,
                      sourceByKey: labels.thumbnails.sourceByKey,
                    }}
                  />
                </PageRangeSelector>
              ) : (
                <>
                  {mode === "master" && (
                    <p
                      className="font-body text-[10.5px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {labels.mode.masterNote}
                    </p>
                  )}
                  {bgLoading ? (
                    <p
                      className="font-body text-[11px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {labels.fileStatus.analyzing}
                    </p>
                  ) : (
                    <SlideThumbStrip
                      backgrounds={currentBgs}
                      thumbnailUrls={bgObjectUrls}
                      selectable={null}
                      labels={{
                        emptyThumb: labels.thumbnails.empty,
                        sourceByKey: labels.thumbnails.sourceByKey,
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Divider */}
          <div style={{ background: "var(--hairline)" }} />

          {/* RIGHT panel */}
          <div className="space-y-4 px-6 py-5">
            <BackgroundPicker
              bgFile={bgFile}
              bgPreviewUrl={bgPreviewUrl}
              galleryImage={galleryImage}
              onDirectUpload={handleDirectUpload}
              onGallerySelect={handleGallerySelect}
              onClear={clearBgSelection}
              labels={{
                heading: labels.background.heading,
                previewLabel: labels.background.preview,
                empty: labels.background.empty,
                fromGallery: labels.background.fromGallery,
                fromUpload: labels.background.fromUpload,
                clear: labels.background.clear,
                uploadLabel: labels.background.uploadLabel,
                uploadHint: labels.background.uploadHint,
                gallery: labels.gallery,
              }}
            />

            {/* Action area */}
            <div className="space-y-2">
              {status === "idle" && (
                <button
                  type="button"
                  onClick={canRun ? run : undefined}
                  disabled={!canRun}
                  className="glint inline-flex h-11 w-full items-center justify-center gap-2 rounded-[5px] font-display text-[13px] font-medium tracking-[0.02em] focus-ring disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    background: "var(--accent-electric)",
                    color: "#fff",
                    boxShadow:
                      "0 1px 0 rgba(255,255,255,0.2) inset, 0 1px 2px rgba(20,30,60,0.15), 0 6px 16px -6px color-mix(in oklch, var(--accent-electric) 60%, transparent)",
                  }}
                >
                  <UploadCloud size={14} />
                  <span>{labels.action.apply}</span>
                </button>
              )}
              {!canRun && status === "idle" && applyDisabledLabel && (
                <p
                  className="text-center font-body text-[10.5px]"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {applyDisabledLabel}
                </p>
              )}

              <ProcessingStatus
                status={status}
                progress={progress}
                errorMessage={errorMessage}
                onRetry={retry}
                onDownload={download}
                onReset={onReset}
                labels={labels.processing}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
