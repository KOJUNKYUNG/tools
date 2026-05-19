"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MaximizeIcon, RotateCcwIcon } from "lucide-react";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import {
  resizeImage,
  type ResizeResult,
  type CropArea,
  type ResizePreset,
  type AspectPreset,
} from "@/lib/image/resizeImage";
import { maxFitCrop } from "@/lib/image/maxFitCrop";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { stageFiles } from "@/lib/common/toolHandoff";
import type { CropRect } from "@/components/image/CropSelector";
import type { ImageResizeLabels } from "./labels";
import { ImageResizeControls } from "./ImageResizeControls";
import { ImageResizePresets, type ActivePreset } from "./ImageResizePresets";
import { ImageResizePreview } from "./ImageResizePreview";
import { ImageResizeResult } from "./ImageResizeResult";

const IMAGE_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

interface ImageResizeToolProps {
  labels: ImageResizeLabels;
  /** When mounted inline in Screen3Workspace, suppress the page-level header. */
  inline?: boolean;
  /** Locale path segment for cross-tool navigation, e.g. "ko" or "en". */
  lang: string;
}

export function ImageResizeTool({ labels, inline = false, lang }: ImageResizeToolProps) {
  const router = useRouter();

  const [origDims, setOrigDims] = useState<{ w: number; h: number } | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const imageUrlRef = useRef<string | null>(null);

  const [targetW, setTargetW] = useState("");
  const [targetH, setTargetH] = useState("");
  const [lockAspect, setLockAspect] = useState(true);
  const [cropEnabled, setCropEnabled] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [uploadKey, setUploadKey] = useState(0);
  const [activePreset, setActivePreset] = useState<ActivePreset>(null);

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
  } = useToolProcessor<ResizeResult>({
    processor: async (files) => {
      const file = files[0];
      const w = Math.max(1, parseInt(targetW || "0", 10) || 0);
      const h = Math.max(1, parseInt(targetH || "0", 10) || 0);

      if (cropEnabled && cropRect) {
        const crop: CropArea = {
          x: cropRect.x,
          y: cropRect.y,
          width: cropRect.width,
          height: cropRect.height,
        };
        return resizeImage({
          file,
          mode: "preset",
          width: w,
          height: h,
          crop,
        });
      }
      return resizeImage({
        file,
        mode: "pixel",
        width: w,
        height: h,
        lockAspectRatio: false,
      });
    },
    onDownload: async (res) => {
      const file = files[0];
      const ext = file?.name.split(".").pop() ?? "png";
      const baseName = file?.name.replace(/\.[^.]+$/, "") ?? "resized";
      const buf = await res.blob.arrayBuffer();
      downloadBlob(
        new Uint8Array(buf),
        `${baseName}-resized.${ext}`,
        res.blob.type,
      );
    },
  });

  const handleFilesChange = useCallback(
    (newFiles: File[]) => {
      setFiles(newFiles);
      setOrigDims(null);
      setCropRect(null);

      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = null;
      }

      if (newFiles.length === 0) {
        setImageUrl(null);
        setTargetW("");
        setTargetH("");
        return;
      }

      const url = URL.createObjectURL(newFiles[0]);
      imageUrlRef.current = url;
      setImageUrl(url);

      const img = new Image();
      img.onload = () => {
        const dims = { w: img.naturalWidth, h: img.naturalHeight };
        setOrigDims(dims);
        setTargetW(String(dims.w));
        setTargetH(String(dims.h));
      };
      img.src = url;
    },
    [setFiles],
  );

  useEffect(
    () => () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    },
    [],
  );

  const wNum = parseInt(targetW || "0", 10) || 0;
  const hNum = parseInt(targetH || "0", 10) || 0;

  const handleWidthChange = (next: string) => {
    setActivePreset(null);
    setTargetW(next);
    if (lockAspect && origDims) {
      const nw = parseInt(next || "0", 10) || 0;
      if (nw > 0) {
        const ratio = (parseInt(targetW || "0", 10) || origDims.w) /
          (parseInt(targetH || "0", 10) || origDims.h);
        const nh = Math.max(1, Math.round(nw / ratio));
        setTargetH(String(nh));
      }
    }
  };

  const handleHeightChange = (next: string) => {
    setActivePreset(null);
    setTargetH(next);
    if (lockAspect && origDims) {
      const nh = parseInt(next || "0", 10) || 0;
      if (nh > 0) {
        const ratio = (parseInt(targetW || "0", 10) || origDims.w) /
          (parseInt(targetH || "0", 10) || origDims.h);
        const nw = Math.max(1, Math.round(nh * ratio));
        setTargetW(String(nw));
      }
    }
  };

  const handleSizePreset = (preset: ResizePreset, idx: number) => {
    setTargetW(String(preset.width));
    setTargetH(String(preset.height));
    setActivePreset({ kind: "size", idx });
  };

  const handleRatioPreset = (preset: AspectPreset, idx: number) => {
    setLockAspect(true);
    if (!origDims) {
      setTargetW(String(preset.w));
      setTargetH(String(preset.h));
      setActivePreset({ kind: "ratio", idx });
      return;
    }
    const rect = maxFitCrop(origDims, preset.w, preset.h);
    setTargetW(String(rect.width));
    setTargetH(String(rect.height));
    if (cropEnabled) {
      setCropRect(rect);
    }
    setActivePreset({ kind: "ratio", idx });
  };

  const handleToggleCropEnabled = () => {
    setCropEnabled((prev) => {
      const next = !prev;
      if (next && origDims && wNum > 0 && hNum > 0) {
        setCropRect(maxFitCrop(origDims, wNum, hNum));
      }
      return next;
    });
  };

  const handleCompressOrConvert = useCallback(async () => {
    if (!result) return;
    const file = files[0];
    const baseName = file?.name.replace(/\.[^.]+$/, "") ?? "resized";
    const ext = file?.name.split(".").pop() ?? "png";
    const resized = new File(
      [result.blob],
      `${baseName}-resized.${ext}`,
      { type: result.blob.type },
    );
    stageFiles([resized], "image-resize");
    router.push(`/${lang}/tools/image-compress`);
  }, [result, files, lang, router]);

  const file = files[0];
  const downloadFileName = file
    ? `${file.name.replace(/\.[^.]+$/, "")}-resized.${file.name.split(".").pop()}`
    : "resized.png";

  const onReset = useCallback(() => {
    retry();
    handleFilesChange([]);
  }, [retry, handleFilesChange]);

  // Body "다시 업로드" — same as onReset, plus re-mount FileUpload with
  // openOnMount so the OS file picker opens immediately. Mirrors ppt-background's
  // "다시 업로드" intent (reset → ready for next file in one click).
  const handleResetAndReopen = useCallback(() => {
    retry();
    handleFilesChange([]);
    setUploadKey((k) => k + 1);
  }, [retry, handleFilesChange]);

  // In inline mode (Screen3 mount), the chrome/header/reset are suppressed —
  // the surrounding surface provides chrome. In page-route mode, this component
  // renders its own silver card chrome + header + reset, mirroring ppt-background.
  const body = (
    <div className={inline ? "space-y-5" : "space-y-5 px-6 py-4"}>
      {!file && (
        <FileUpload
          key={uploadKey}
          openOnMount={uploadKey > 0}
          accept={IMAGE_ACCEPT}
          multiple={false}
          onFiles={handleFilesChange}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={{ maxSize: labels.uploadMaxSize }}
        />
      )}

      {file && origDims && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Left: preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div
                className="truncate font-display text-[12px]"
                style={{ color: "var(--ink)" }}
              >
                {file.name}
              </div>
              <button
                type="button"
                onClick={handleResetAndReopen}
                className="rounded-[5px] border px-2.5 py-1 font-display text-[11px] transition-colors hover:border-[color:var(--accent-electric)]"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--border)",
                  color: "var(--ink-strong)",
                }}
              >
                {labels.reupload}
              </button>
            </div>
            <ImageResizePreview
              imageUrl={imageUrl}
              cropEnabled={cropEnabled}
              targetW={wNum}
              targetH={hNum}
              onCropChange={setCropRect}
              cropRect={cropRect}
              cropSelectionLabel={labels.cropSelectionLabel}
              stretchModeLabel={labels.stretchModeLabel}
              cropFooterTemplate={labels.cropFooterTemplate}
            />
          </div>

          {/* Right: controls */}
          <div className="space-y-4">
            {status === "done" && result ? (
              <ImageResizeResult
                doneTitle={labels.doneTitle}
                downloadLabel={labels.download}
                resultSummaryTemplate={labels.resultSummary}
                compressLinkLabel={labels.compressLink}
                width={result.width}
                height={result.height}
                byteSize={result.blob.size}
                mimeType={result.blob.type}
                onDownload={download}
                onCompressOrConvert={handleCompressOrConvert}
                tryAgainLabel={labels.tryAgain}
                onTryAgain={retry}
              />
            ) : status === "idle" ? (
              <button
                type="button"
                onClick={run}
                className="glint inline-flex w-full items-center justify-center gap-1.5 rounded-[5px] px-3 h-9 font-display text-[12px] font-medium"
                style={{ background: "var(--accent-electric)", color: "#fff" }}
              >
                {labels.apply}
              </button>
            ) : (
              <ProcessingStatus
                status={status}
                progress={progress}
                errorMessage={errorMessage}
                onRetry={retry}
                onDownload={download}
                downloadFileName={downloadFileName}
                onTryAnother={retry}
              />
            )}

            <ImageResizeControls
              widthLabel={labels.widthLabel}
              heightLabel={labels.heightLabel}
              lockAspectLabel={labels.lockAspect}
              unlockAspectLabel={labels.unlockAspect}
              cropToggleLabel={labels.cropToggle}
              cropToggleHint={labels.cropToggleHint}
              widthValue={targetW}
              heightValue={targetH}
              onWidthChange={handleWidthChange}
              onHeightChange={handleHeightChange}
              lockAspect={lockAspect}
              onToggleLock={() => setLockAspect((v) => !v)}
              cropEnabled={cropEnabled}
              onToggleCropEnabled={handleToggleCropEnabled}
            />

            <p
              className="font-body text-[11.5px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {labels.originalSize}: {origDims.w} × {origDims.h}px
            </p>

            <ImageResizePresets
              sizePresetsTitle={labels.sizePresetsTitle}
              ratioPresetsTitle={labels.ratioPresetsTitle}
              onSizePreset={handleSizePreset}
              onRatioPreset={handleRatioPreset}
              activePreset={activePreset}
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
          <MaximizeIcon size={18} />
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
