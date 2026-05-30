"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MaximizeIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import {
  resizeImage,
  MAX_DIMENSION,
  type ResizeResult,
  type CropArea,
  type ResizePreset,
  type AspectPreset,
} from "@/lib/image/resizeImage";
import { maxFitCrop } from "@/lib/image/maxFitCrop";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { stageFiles } from "@/lib/common/toolHandoff";
import { normalizeImageFile } from "@/lib/image/heic";
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
  "image/heic": [".heic"],
  "image/heif": [".heif"],
};

/**
 * Scale a (w, h) pair down so the largest side fits within `max`, preserving
 * the aspect ratio. Used when lock-aspect computes a counterpart dimension that
 * could exceed MAX_DIMENSION. No-op when both already fit.
 */
function clampPairToMax(
  w: number,
  h: number,
  max: number,
): { w: number; h: number } {
  const largest = Math.max(w, h);
  if (largest <= max) return { w, h };
  const scale = max / largest;
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
  };
}

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
  const [normalizing, setNormalizing] = useState(false);

  const [targetW, setTargetW] = useState("");
  const [targetH, setTargetH] = useState("");
  const [lockAspect, setLockAspect] = useState(true);
  const [lockedRatio, setLockedRatio] = useState<number | null>(null);
  const [cropEnabled, setCropEnabled] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [activePreset, setActivePreset] = useState<ActivePreset>(null);
  const [customRatio, setCustomRatio] = useState<{ w: string; h: string } | null>(null);
  const [customOpen, setCustomOpen] = useState(false);

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
      retry();
      setFiles(newFiles);
      setOrigDims(null);
      setLockedRatio(null);
      setCropRect(null);
      setActivePreset(null);
      setCropEnabled(false);
      // Keep customRatio (user's last custom value survives re-upload), only
      // collapse the input row.
      setCustomOpen(false);

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
        setLockedRatio(dims.h > 0 ? dims.w / dims.h : null);
      };
      img.src = url;
    },
    [setFiles, retry],
  );

  useEffect(
    () => () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    },
    [],
  );

  /** Normalize HEIC/HEIF → JPEG, then hand off to handleFilesChange. */
  const handleUpload = useCallback(
    async (newFiles: File[]) => {
      if (newFiles.length === 0) return;
      setNormalizing(true);
      try {
        const normalized = await normalizeImageFile(newFiles[0]);
        handleFilesChange([normalized]);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "HEIC 파일을 변환할 수 없습니다.";
        toast.error(msg);
      } finally {
        setNormalizing(false);
      }
    },
    [handleFilesChange],
  );

  const wNum = parseInt(targetW || "0", 10) || 0;
  const hNum = parseInt(targetH || "0", 10) || 0;

  const handleWidthChange = (next: string) => {
    // Editing W/H clears a SIZE preset, but a ratio/custom preset represents a
    // LOCKED RATIO that the edit preserves — keep it highlighted.
    setActivePreset((prev) => (prev?.kind === "size" ? null : prev));
    setTargetW(next);
    if (lockAspect && lockedRatio && lockedRatio > 0) {
      const nw = parseInt(next || "0", 10) || 0;
      if (nw > 0) {
        const rawH = Math.max(1, Math.round(nw / lockedRatio));
        const pair = clampPairToMax(nw, rawH, MAX_DIMENSION);
        setTargetW(String(pair.w));
        setTargetH(String(pair.h));
      }
    }
  };

  const handleHeightChange = (next: string) => {
    setActivePreset((prev) => (prev?.kind === "size" ? null : prev));
    setTargetH(next);
    if (lockAspect && lockedRatio && lockedRatio > 0) {
      const nh = parseInt(next || "0", 10) || 0;
      if (nh > 0) {
        const rawW = Math.max(1, Math.round(nh * lockedRatio));
        const pair = clampPairToMax(rawW, nh, MAX_DIMENSION);
        setTargetW(String(pair.w));
        setTargetH(String(pair.h));
      }
    }
  };

  const handleRevertToOriginal = useCallback(() => {
    if (!origDims) return;
    setActivePreset(null);
    setTargetW(String(origDims.w));
    setTargetH(String(origDims.h));
    setLockedRatio(origDims.h > 0 ? origDims.w / origDims.h : null);
    setCustomOpen(false);
  }, [origDims]);

  const handleToggleLock = useCallback(() => {
    setLockAspect((prev) => {
      const next = !prev;
      if (next) {
        // turning lock ON — capture the current committed pair's exact ratio
        const w = parseInt(targetW || "0", 10) || 0;
        const h = parseInt(targetH || "0", 10) || 0;
        if (w > 0 && h > 0) setLockedRatio(w / h);
      } else {
        // turning lock OFF — a ratio/custom preset only describes a locked
        // ratio, so release un-highlights it and collapses the custom input.
        setActivePreset((p) =>
          p?.kind === "ratio" || p?.kind === "custom" ? null : p,
        );
        setCustomOpen(false);
      }
      return next;
    });
  }, [targetW, targetH]);

  const handleSizePreset = (preset: ResizePreset, idx: number) => {
    setCustomOpen(false);
    setTargetW(String(preset.width));
    setTargetH(String(preset.height));
    setLockedRatio(
      preset.height > 0 ? preset.width / preset.height : null,
    );
    setActivePreset({ kind: "size", idx });
  };

  // Shared ratio-apply: turns lock ON, stores the EXACT ratio (not rounded
  // maxFitCrop dims, so lock computations don't compound rounding error), and
  // recomputes the fitting W/H. Used by ratio presets and the custom input.
  const applyRatio = useCallback(
    (rw: number, rh: number) => {
      setLockAspect(true);
      setLockedRatio(rw / rh);
      if (origDims) {
        const rect = maxFitCrop(origDims, rw, rh);
        setTargetW(String(rect.width));
        setTargetH(String(rect.height));
        if (cropEnabled) setCropRect(rect);
      }
    },
    [origDims, cropEnabled],
  );

  const handleRatioPreset = (preset: AspectPreset, idx: number) => {
    setCustomOpen(false);
    applyRatio(preset.w, preset.h);
    setActivePreset({ kind: "ratio", idx });
  };

  const handleCustomToggle = useCallback(() => {
    setCustomOpen(true);
    if (customRatio) {
      const rw = parseInt(customRatio.w || "0", 10) || 0;
      const rh = parseInt(customRatio.h || "0", 10) || 0;
      if (rw > 0 && rh > 0) {
        applyRatio(rw, rh);
        setActivePreset({ kind: "custom" });
      }
    }
  }, [customRatio, applyRatio]);

  const handleCustomRatioInput = useCallback((w: string, h: string) => {
    setCustomRatio({ w, h });
  }, []);

  const handleCustomRatioCommit = useCallback(() => {
    if (!customRatio) return;
    const rw = parseInt(customRatio.w || "0", 10) || 0;
    const rh = parseInt(customRatio.h || "0", 10) || 0;
    if (rw > 0 && rh > 0) {
      applyRatio(rw, rh);
      setActivePreset({ kind: "custom" });
    }
  }, [customRatio, applyRatio]);

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

  // Body "다시 업로드" — open the OS file picker on the current view via a
  // hidden <input type="file">. No remount, no upload-screen flash, no
  // StrictMode-induced double-open.
  const handleReupload = useCallback(() => {
    reuploadInputRef.current?.click();
  }, []);

  const handleHiddenInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newFiles = e.target.files ? Array.from(e.target.files) : [];
      if (newFiles.length > 0) {
        void handleUpload(newFiles);
      }
      // Allow re-selecting the same file in a row
      e.target.value = "";
    },
    [handleUpload],
  );

  // In inline mode (Screen3 mount), the chrome/header/reset are suppressed —
  // the surrounding surface provides chrome. In page-route mode, this component
  // renders its own silver card chrome + header + reset, mirroring ppt-background.
  const body = (
    <div className={inline ? "space-y-5" : "space-y-5 px-6 py-4"}>
      <input
        ref={reuploadInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        onChange={handleHiddenInputChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      {normalizing && (
        <div className="flex items-center gap-2 text-sm text-[color:var(--ink)]">
          <span className="inline-block size-4 animate-spin rounded-full border-2 border-[color:var(--accent-electric)] border-t-transparent" />
          처리 중…
        </div>
      )}

      {!file && (
        <FileUpload
          accept={IMAGE_ACCEPT}
          multiple={false}
          onFiles={(fs) => void handleUpload(fs)}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={{ ...labels.fileUpload, maxSize: labels.uploadMaxSize }}
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
                onClick={handleReupload}
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
            ) : (
              <>
                {status === "idle" ? (
                  <button
                    type="button"
                    onClick={run}
                    className="btn-primary glint inline-flex w-full items-center justify-center gap-1.5 rounded-[9px] px-3 h-9 font-display text-[12px] font-medium"
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
                  onToggleLock={handleToggleLock}
                  cropEnabled={cropEnabled}
                  onToggleCropEnabled={handleToggleCropEnabled}
                  origDims={origDims}
                  originalSizeLabel={labels.originalSize}
                  revertToOriginalLabel={labels.revertToOriginal}
                  onRevertToOriginal={handleRevertToOriginal}
                />

                <ImageResizePresets
                  sizePresetsTitle={labels.sizePresetsTitle}
                  ratioPresetsTitle={labels.ratioPresetsTitle}
                  sizePresetLabels={labels.sizePresetLabels}
                  onSizePreset={handleSizePreset}
                  onRatioPreset={handleRatioPreset}
                  activePreset={activePreset}
                  customLabel={labels.customRatio}
                  customOpen={customOpen}
                  customRatio={customRatio}
                  onCustomToggle={handleCustomToggle}
                  onCustomRatioInput={handleCustomRatioInput}
                  onCustomRatioCommit={handleCustomRatioCommit}
                />
              </>
            )}
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
