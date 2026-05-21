"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ShrinkIcon, RotateCcwIcon } from "lucide-react";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { consumeStagedFiles } from "@/lib/common/toolHandoff";
import {
  compressImages,
  type CompressResult,
  type OutputFormat,
} from "@/lib/image/compressImage";
import { computeSavings } from "@/lib/image/computeSavings";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { template } from "@/lib/common/template";
import type { ImageCompressLabels } from "./labels";
import { ImageCompressPreview } from "./ImageCompressPreview";
import { ImageCompressControls } from "./ImageCompressControls";
import { ImageCompressFileList } from "./ImageCompressFileList";
import { ImageCompressResult } from "./ImageCompressResult";

const IMAGE_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

function formatLabel(format: OutputFormat): string {
  if (format === "image/jpeg") return "JPG";
  if (format === "image/png") return "PNG";
  return "WebP";
}

interface ImageCompressToolProps {
  labels: ImageCompressLabels;
  /** When mounted inline in Screen3Workspace, suppress the page-level card chrome. */
  inline?: boolean;
}

export function ImageCompressTool({
  labels,
  inline = false,
}: ImageCompressToolProps) {
  const [outputFormat, setOutputFormat] = useState<OutputFormat | null>(null);
  const [quality, setQuality] = useState(100);
  const [urls, setUrls] = useState<string[]>([]);
  const urlsRef = useRef<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [estimate, setEstimate] = useState<{ size: number; pct: number } | null>(
    null,
  );
  const [estimating, setEstimating] = useState(false);
  const estimateTokenRef = useRef(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [showCompressed, setShowCompressed] = useState(true);
  const reuploadInputRef = useRef<HTMLInputElement | null>(null);

  const {
    files,
    setFiles,
    status,
    progress,
    errorMessage,
    result,
    run,
    retry,
    download,
  } = useToolProcessor<CompressResult>({
    processor: (files, onProgress) => {
      if (!outputFormat) throw new Error("출력 형식을 선택해 주세요.");
      return compressImages({ files, quality, outputFormat, onProgress });
    },
    onDownload: (res) => {
      const mime =
        res.type === "zip" ? "application/zip" : outputFormat ?? "image/jpeg";
      downloadBlob(res.data, res.filename, mime);
    },
  });

  const revokeAll = useCallback(() => {
    for (const u of urlsRef.current) URL.revokeObjectURL(u);
    urlsRef.current = [];
  }, []);

  // Swap the compressed-preview object URL (revoke-on-replace; null = show original).
  const setCompressedPreview = useCallback((blob: Blob | null) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    const url = blob ? URL.createObjectURL(blob) : null;
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }, []);

  const handleFilesChange = useCallback(
    (newFiles: File[]) => {
      retry();
      revokeAll();
      const nextUrls = newFiles.map((f) => URL.createObjectURL(f));
      urlsRef.current = nextUrls;
      setUrls(nextUrls);
      setFiles(newFiles);
      setCurrentIndex(0);
      setEstimate(null);
      setCompressedPreview(null);
    },
    [retry, revokeAll, setFiles, setCompressedPreview],
  );

  // Consume cross-tool handoff (e.g. files staged by image-resize). Once on mount.
  useEffect(() => {
    const staged = consumeStagedFiles();
    if (staged && staged.files.length > 0) handleFilesChange(staged.files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke all object URLs on unmount.
  useEffect(
    () => () => {
      revokeAll();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [revokeAll],
  );

  // Live estimated output size + compressed preview for the current image.
  useEffect(() => {
    // No estimable compressed output → show the original, no spinner.
    if (!outputFormat || outputFormat === "image/png" || files.length === 0) {
      setEstimate(null);
      setEstimating(false);
      setCompressedPreview(null);
      return;
    }
    // Only idle owns the live estimate/preview. While processing or done, retain
    // the current preview (the done effect sets the actual result image).
    if (status !== "idle") {
      setEstimating(false);
      return;
    }
    const file = files[currentIndex];
    if (!file) return;
    const token = ++estimateTokenRef.current;
    setEstimating(true);
    const timer = setTimeout(async () => {
      try {
        const res = await compressImages({ files: [file], quality, outputFormat });
        if (token !== estimateTokenRef.current) return;
        const img = res.images[0];
        const { pct } = computeSavings(img.originalSize, img.compressedSize);
        setEstimate({ size: img.compressedSize, pct });
        setCompressedPreview(img.blob);
      } catch {
        if (token === estimateTokenRef.current) {
          setEstimate(null);
          setCompressedPreview(null);
        }
      } finally {
        if (token === estimateTokenRef.current) setEstimating(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [outputFormat, quality, currentIndex, files, status, setCompressedPreview]);

  // In the done state, show the actual compressed result for the current image.
  useEffect(() => {
    if (status === "done" && result) {
      setCompressedPreview(result.images[currentIndex]?.blob ?? null);
    }
  }, [status, result, currentIndex, setCompressedPreview]);

  const handleRemove = useCallback(
    (index: number) => {
      // Removing a file invalidates any prior compression result; reset so the
      // file list never shows stale done-mode rows for a now-missing file.
      retry();
      setCompressedPreview(null);
      const removed = urlsRef.current[index];
      if (removed) URL.revokeObjectURL(removed);
      const nextUrls = urlsRef.current.filter((_, i) => i !== index);
      urlsRef.current = nextUrls;
      setUrls(nextUrls);
      const nextFiles = files.filter((_, i) => i !== index);
      setFiles(nextFiles);
      setCurrentIndex((idx) =>
        Math.max(0, Math.min(idx, nextFiles.length - 1)),
      );
    },
    [files, setFiles, retry, setCompressedPreview],
  );

  const handleReupload = useCallback(
    () => reuploadInputRef.current?.click(),
    [],
  );

  const handleHiddenInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (status === "processing") {
        e.target.value = "";
        return;
      }
      const newFiles = e.target.files ? Array.from(e.target.files) : [];
      if (newFiles.length > 0) handleFilesChange(newFiles);
      e.target.value = "";
    },
    [handleFilesChange, status],
  );

  const onReset = useCallback(() => {
    handleFilesChange([]);
    setOutputFormat(null);
    setQuality(100);
  }, [handleFilesChange]);

  const hasFiles = files.length > 0;
  const isDone = status === "done" && !!result;
  const busy = status === "processing";

  const body = (
    <div className={inline ? "space-y-5" : "space-y-5 px-6 py-4"}>
      <input
        ref={reuploadInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleHiddenInputChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {!hasFiles ? (
        <FileUpload
          accept={IMAGE_ACCEPT}
          multiple
          hideFileList
          onFiles={handleFilesChange}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={{ maxSize: labels.uploadMaxSize }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <ImageCompressPreview
            fileName={files[currentIndex]?.name ?? ""}
            totalCount={files.length}
            currentIndex={currentIndex}
            imageUrl={
              (showCompressed ? previewUrl : null) ?? urls[currentIndex] ?? null
            }
            onPrev={() => {
              if (status === "idle") setCompressedPreview(null);
              setCurrentIndex((i) => Math.max(0, i - 1));
            }}
            onNext={() => {
              if (status === "idle") setCompressedPreview(null);
              setCurrentIndex((i) => Math.min(files.length - 1, i + 1));
            }}
            onReupload={handleReupload}
            reuploadLabel={labels.reupload}
            moreImagesTemplate={labels.moreImagesTemplate}
            prevAria={labels.prevAria}
            nextAria={labels.nextAria}
            disabled={busy}
            showCompressed={showCompressed}
            onToggleCompressed={setShowCompressed}
            compareLabel={labels.comparePreview}
          />

          <div className="space-y-3">
            {/* Reserve height so the file list below does not shift between the
                idle (button + controls), processing, and done (result card) states. */}
            <div style={{ minHeight: "188px" }}>
              {isDone ? (
                <ImageCompressResult
                  doneTitle={labels.doneTitle}
                  settingsText={template(labels.settingsTemplate, {
                    format: outputFormat ? formatLabel(outputFormat) : "",
                    quality,
                  })}
                  downloadLabel={labels.download}
                  recompressLabel={labels.recompress}
                  onDownload={download}
                  onRecompress={retry}
                />
              ) : status === "idle" ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={run}
                    disabled={!outputFormat}
                    className="glint inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[5px] px-3 font-display text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: "var(--accent-electric)", color: "#fff" }}
                  >
                    {template(labels.compressTemplate, { n: files.length })}
                  </button>
                  <ImageCompressControls
                    formatTitle={labels.formatTitle}
                    qualityTitle={labels.qualityTitle}
                    outputFormat={outputFormat}
                    onSelectFormat={setOutputFormat}
                    quality={quality}
                    onQualityChange={setQuality}
                    estimate={estimate}
                    estimating={estimating}
                    estimateTemplate={labels.estimateTemplate}
                    estimatingLabel={labels.estimating}
                    pngLosslessLabel={labels.pngLossless}
                  />
                </div>
              ) : (
                <ProcessingStatus
                  status={status}
                  progress={progress}
                  errorMessage={errorMessage}
                  onRetry={retry}
                />
              )}
            </div>

            <ImageCompressFileList
              mode={isDone ? "done" : "idle"}
              idleFiles={files.map((f) => ({ name: f.name, size: f.size }))}
              doneResults={
                result?.images.map((img) => ({
                  name: img.name,
                  originalSize: img.originalSize,
                  compressedSize: img.compressedSize,
                })) ?? []
              }
              onRemove={handleRemove}
              removeAriaTemplate={labels.removeAria}
              sizeChangeTemplate={labels.sizeChangeTemplate}
              disabled={busy}
            />
          </div>
        </div>
      )}
    </div>
  );

  if (inline) return body;

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-[14px] border"
      style={{
        background: "color-mix(in oklch, var(--surface) 92%, transparent)",
        backdropFilter: "blur(10px) saturate(1.1)",
        WebkitBackdropFilter: "blur(10px) saturate(1.1)",
        borderColor: "var(--border)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 48px -16px rgba(20,30,60,0.28), 0 8px 20px -6px rgba(20,30,60,0.16)",
      }}
    >
      <button
        type="button"
        onClick={onReset}
        aria-label={labels.header.reset}
        title={labels.header.reset}
        className="absolute right-6 top-4 z-10 rounded-md p-1.5 transition-colors hover:text-[color:var(--ink-strong)]"
        style={{ color: "var(--ink-soft)" }}
      >
        <RotateCcwIcon className="size-4" />
      </button>
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
          <ShrinkIcon size={18} />
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
      {body}
    </div>
  );
}
