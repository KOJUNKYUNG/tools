"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileIcon, Layers, RotateCcwIcon, UploadCloud } from "lucide-react";
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
import { template } from "@/lib/common/template";
import type { GalleryImage, GalleryCategory } from "@/lib/gallery/types";
import { ModeSelector } from "./ModeSelector";
import { SlideThumbStrip } from "./SlideThumbStrip";
import { BackgroundPicker } from "./BackgroundPicker";
import { PptConversionGuide, type ConversionMethodLabels } from "./PptConversionGuide";

const PPTX_ACCEPT = {
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.ms-powerpoint": [".ppt"],
};

/**
 * Load a gallery image (any URL the browser can decode — picsum JPEG, SVG data
 * URL, etc.) and convert it to a PNG File via Canvas. This gives the
 * downstream PPTX writer a single, predictable input (raster PNG bytes with a
 * correct MIME label) and avoids embedding SVG into PPTX backgrounds, which
 * PowerPoint handles inconsistently.
 */
async function galleryImageToPngFile(url: string, id: string): Promise<File> {
  return new Promise<File>((resolve, reject) => {
    const img = new globalThis.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const w = img.naturalWidth || 1920;
      const h = img.naturalHeight || 1080;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas toBlob returned null"));
            return;
          }
          resolve(new File([blob], `gallery-${id}.png`, { type: "image/png" }));
        },
        "image/png",
      );
    };
    img.onerror = () => reject(new Error("Failed to load gallery image"));
    img.src = url;
  });
}

export interface PptBackgroundToolLabels {
  header: { title: string; description: string };
  upload: { dropzoneLabel: string; dropzoneHint: string; pptDetected: string };
  conversion: { heading: string; note: string; methods: ConversionMethodLabels[] };
  fileStatus: { slideCountTemplate: string; changeFile: string; analyzing: string };
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
    sourceUpload: string;
    sourceGallery: string;
  };
  gallery: {
    heading: string;
    countSuffixTemplate: string;
    categoryAll: string;
    categoryByKey: Record<GalleryCategory, string>;
    empty: string;
  };
  action: {
    apply: string;
    applyDisabledHint: string;
    specificEmpty: string;
    reset: string;
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
  /**
   * When true, the tool renders without its outer card chrome (border,
   * shadow, glass surface) and without the internal header strip. Use this
   * when mounting inside a surface that already provides the chrome
   * (e.g. Screen3Workspace's inline card). Default: false.
   */
  inline?: boolean;
}

export function PptBackgroundTool({ labels, inline = false }: PptBackgroundToolProps) {
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

  const openPptxFileDialog = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ppt,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint";
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        setPptxFiles(Array.from(target.files));
      }
    };
    input.click();
  }, [setPptxFiles]);

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

  // When the user picks a new background after a completed run, drop the
  // Done box and let them Apply again with the new background.
  useEffect(() => {
    if (status === "done") retry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgFiles, galleryImage?.id]);

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
        const file = await galleryImageToPngFile(image.url, image.id);
        setBgFiles([file]);
      } catch {
        setGalleryImage(null);
        if (bgPreviewUrl && bgPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(bgPreviewUrl);
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

  const handleTryAnother = useCallback(() => {
    retry();
    setBgFiles([]);
    setGalleryImage(null);
    if (bgPreviewUrl && bgPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(bgPreviewUrl);
    setBgPreviewUrl(null);
    // Keep pptxFile, currentBgs, bgObjectUrls, mode, selectedSlides.
  }, [retry, bgPreviewUrl]);

  // ───────── Render ─────────
  return (
    <div
      className={
        inline
          ? "flex h-full flex-col"
          : "flex flex-col overflow-hidden rounded-[14px] border"
      }
      style={
        inline
          ? { maxHeight: "calc(50vh)" }
          : {
              background: "color-mix(in oklch, var(--surface) 92%, transparent)",
              backdropFilter: "blur(10px) saturate(1.1)",
              WebkitBackdropFilter: "blur(10px) saturate(1.1)",
              borderColor: "var(--border)",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 48px -16px rgba(20,30,60,0.28), 0 8px 20px -6px rgba(20,30,60,0.16)",
              maxHeight: "calc(50vh)",
            }
      }
    >
      {!inline && (
        <div
          className="flex items-start gap-3 border-b px-6 pt-3 pb-3"
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
          <button
            type="button"
            onClick={onReset}
            aria-label={labels.action.reset}
            title={labels.action.reset}
            className="shrink-0 rounded-md p-1.5 transition-colors hover:text-[color:var(--ink-strong)]"
            style={{ color: "var(--ink-soft)" }}
          >
            <RotateCcwIcon className="size-4" />
          </button>
        </div>
      )}

      {/* Body */}
      {!pptxFile ? (
        // Empty state — centered dropzone, optional conversion guide below.
        <div className="space-y-4 px-6 py-4">
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
          className="grid min-h-0 flex-1"
          style={{
            gridTemplateColumns: "minmax(0, 1fr) 1px minmax(0, 1fr)",
          }}
        >
          {/* LEFT panel */}
          <div className="flex h-full min-h-0 flex-col gap-3 px-6 py-3">
            {/* File status */}
            <div
              className="flex shrink-0 items-center gap-3 rounded-[8px] border px-3 py-2.5"
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
                    ? template(labels.fileStatus.slideCountTemplate, { n: totalSlides })
                    : labels.fileStatus.analyzing}
                </p>
              </div>
              <button
                type="button"
                onClick={openPptxFileDialog}
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

            {/* ApplyTo row: label (left) + mode-specific dynamic content (right, flex-1) */}
            <div className="flex shrink-0 items-center gap-3" style={{ minHeight: "32px" }}>
              <div
                className="shrink-0 font-display text-[11px] font-medium uppercase tracking-[0.08em]"
                style={{ color: "var(--ink-soft)" }}
              >
                {labels.mode.label}
              </div>
              <div className="min-w-0 flex-1">
                {mode === "all-slides" && <span>&nbsp;</span>}
                {mode === "master" && (
                  <p
                    className="truncate font-body text-[10.5px]"
                    style={{ color: "var(--ink-soft)" }}
                    title={labels.mode.masterNote}
                  >
                    {labels.mode.masterNote}
                  </p>
                )}
                {mode === "specific-slides" && (
                  <PageRangeSelector
                    totalPages={totalSlides}
                    selected={selectedSlides}
                    onChange={setSelectedSlides}
                    inputPlaceholder={labels.mode.specificInput}
                    selectAllLabel={labels.mode.specificSelectAll}
                    clearLabel={labels.mode.specificClear}
                  />
                )}
              </div>
            </div>

            {/* Mode segmented control */}
            <div className="shrink-0">
              <ModeSelector
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  if (next !== "specific-slides") setSelectedSlides(new Set());
                }}
                labels={{
                  optionAll: labels.mode.optionAll,
                  optionMaster: labels.mode.optionMaster,
                  optionSpecific: labels.mode.optionSpecific,
                }}
              />
            </div>

            {/* Slide thumbnail strip — flex-1, fills remaining height */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {bgLoading ? (
                <p className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
                  {labels.fileStatus.analyzing}
                </p>
              ) : (
                <SlideThumbStrip
                  backgrounds={currentBgs}
                  thumbnailUrls={bgObjectUrls}
                  selectable={
                    mode === "specific-slides"
                      ? {
                          selected: selectedSlides,
                          onToggle: (n) => {
                            setSelectedSlides((prev) => {
                              const next = new Set(prev);
                              if (next.has(n)) next.delete(n);
                              else next.add(n);
                              return next;
                            });
                          },
                        }
                      : null
                  }
                  labels={{
                    emptyThumb: labels.thumbnails.empty,
                    sourceByKey: labels.thumbnails.sourceByKey,
                  }}
                />
              )}
            </div>
          </div>

          {/* Divider */}
          <div style={{ background: "var(--hairline)" }} />

          {/* RIGHT panel */}
          <div className="flex h-full min-h-0 flex-col px-6 py-3">
            <BackgroundPicker
              bgFile={bgFile}
              bgPreviewUrl={bgPreviewUrl}
              galleryImage={galleryImage}
              onDirectUpload={handleDirectUpload}
              onGallerySelect={handleGallerySelect}
              onClear={clearBgSelection}
              actionSlot={
                status === "idle" ? (
                  <div className="flex h-full flex-col gap-1.5">
                    <p
                      className="truncate text-center font-body text-[10.5px] leading-[16px]"
                      style={{ color: "var(--ink-soft)", minHeight: "16px" }}
                      title={!canRun && applyDisabledLabel ? applyDisabledLabel : undefined}
                    >
                      {!canRun && applyDisabledLabel ? applyDisabledLabel : " "}
                    </p>
                    <button
                      type="button"
                      onClick={canRun ? run : undefined}
                      disabled={!canRun}
                      className="glint inline-flex w-full flex-1 items-center justify-center gap-2 rounded-[5px] font-display text-[13px] font-medium tracking-[0.02em] focus-ring disabled:cursor-not-allowed disabled:opacity-50"
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
                  </div>
                ) : (
                  <ProcessingStatus
                    status={status}
                    progress={progress}
                    errorMessage={errorMessage}
                    onRetry={retry}
                    onDownload={download}
                    onTryAnother={handleTryAnother}
                    labels={labels.processing}
                  />
                )
              }
              labels={{
                heading: labels.background.heading,
                previewLabel: labels.background.preview,
                empty: labels.background.empty,
                fromGallery: labels.background.fromGallery,
                fromUpload: labels.background.fromUpload,
                clear: labels.background.clear,
                uploadLabel: labels.background.uploadLabel,
                uploadHint: labels.background.uploadHint,
                sourceUpload: labels.background.sourceUpload,
                sourceGallery: labels.background.sourceGallery,
                gallery: labels.gallery,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
