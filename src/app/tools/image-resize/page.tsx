"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import type { ProcessingState } from "@/types";
import { Button } from "@/components/ui/button";
import {
  resizeImage,
  type ResizeMode,
  type ResizeResult,
  type CropArea,
  RESIZE_PRESETS,
} from "@/lib/image/resizeImage";
import { CropSelector, type CropRect } from "@/components/image/CropSelector";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { getErrorMessage } from "@/lib/errors";
import { MaximizeIcon, LockIcon, UnlockIcon } from "lucide-react";

const IMAGE_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

export default function ImageResizePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<ResizeMode>("pixel");
  const [width, setWidth] = useState<string>("");
  const [height, setHeight] = useState<string>("");
  const [percent, setPercent] = useState<string>("50");
  const [lockAspect, setLockAspect] = useState(true);
  const [presetIdx, setPresetIdx] = useState(0);
  const [status, setStatus] = useState<ProcessingState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [origDims, setOrigDims] = useState<{ w: number; h: number } | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const resultRef = useRef<ResizeResult | null>(null);

  const handleFilesChange = useCallback((newFiles: File[]) => {
    setFiles(newFiles);
    setOrigDims(null);
    setCropRect(null);
    resultRef.current = null;
    setStatus("idle");

    if (imageUrl) URL.revokeObjectURL(imageUrl);

    if (newFiles.length > 0) {
      const url = URL.createObjectURL(newFiles[0]);
      setImageUrl(url);
      const img = new Image();
      img.onload = () => {
        setOrigDims({ w: img.naturalWidth, h: img.naturalHeight });
      };
      img.src = url;
    } else {
      setImageUrl(null);
    }
  }, [imageUrl]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const needsCrop =
    mode === "preset" &&
    origDims != null &&
    (() => {
      const preset = RESIZE_PRESETS[presetIdx];
      const origAspect = origDims.w / origDims.h;
      const presetAspect = preset.width / preset.height;
      return Math.abs(origAspect - presetAspect) > 0.01;
    })();

  const handleCropChange = useCallback((rect: CropRect) => {
    setCropRect(rect);
  }, []);

  const handleResize = useCallback(async () => {
    const file = files[0];
    if (!file) return;

    setStatus("processing");
    setProgress(0);
    setErrorMessage("");
    resultRef.current = null;

    try {
      setProgress(30);

      let crop: CropArea | undefined;
      if (mode === "preset" && needsCrop && cropRect) {
        crop = {
          x: cropRect.x,
          y: cropRect.y,
          width: cropRect.width,
          height: cropRect.height,
        };
      }

      const opts =
        mode === "pixel"
          ? {
              file,
              mode: "pixel" as const,
              width: width ? parseInt(width, 10) : undefined,
              height: height ? parseInt(height, 10) : undefined,
              lockAspectRatio: lockAspect,
            }
          : mode === "percent"
            ? {
                file,
                mode: "percent" as const,
                percent: parseFloat(percent),
              }
            : {
                file,
                mode: "preset" as const,
                width: RESIZE_PRESETS[presetIdx].width,
                height: RESIZE_PRESETS[presetIdx].height,
                crop,
              };

      const result = await resizeImage(opts);
      resultRef.current = result;
      setProgress(100);
      setStatus("done");
    } catch (err) {
      setErrorMessage(getErrorMessage(err).message);
      setStatus("error");
    }
  }, [files, mode, width, height, percent, lockAspect, presetIdx, needsCrop, cropRect]);

  const handleDownload = useCallback(async () => {
    if (!resultRef.current) return;
    const { blob } = resultRef.current;
    const ext = files[0]?.name.split(".").pop() ?? "png";
    const baseName = files[0]?.name.replace(/\.[^.]+$/, "") ?? "resized";
    const buf = await blob.arrayBuffer();
    downloadBlob(new Uint8Array(buf), `${baseName}-resized.${ext}`, blob.type);
  }, [files]);

  const handleRetry = useCallback(() => {
    setStatus("idle");
    setProgress(0);
    setErrorMessage("");
    resultRef.current = null;
  }, []);

  const file = files[0];
  const result = resultRef.current;
  const isUpscale =
    result && (result.width > result.originalWidth || result.height > result.originalHeight);

  const MODES: { value: ResizeMode; label: string }[] = [
    { value: "pixel", label: "픽셀 지정" },
    { value: "percent", label: "배율 (%)" },
    { value: "preset", label: "프리셋" },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MaximizeIcon className="size-6" />
        </div>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">
          이미지 크기 변경
        </h1>
        <p className="mt-2 text-muted-foreground">
          이미지의 해상도를 픽셀, 배율, 또는 프리셋으로 변경합니다.
        </p>
      </div>

      <div className="space-y-6">
        <FileUpload
          accept={IMAGE_ACCEPT}
          multiple={false}
          onFiles={handleFilesChange}
          label="이미지를 드래그하거나 클릭하여 업로드"
          description="JPG, PNG, WebP 파일을 지원합니다."
        />

        {file && origDims && status === "idle" && (
          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              원본 크기:{" "}
              <span className="font-semibold text-foreground">
                {origDims.w} × {origDims.h}px
              </span>
            </p>

            <div>
              <p className="mb-2 text-sm font-medium">크기 변경 방식</p>
              <div className="flex gap-2">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMode(m.value)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      mode === m.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {mode === "pixel" && (
              <div className="space-y-3">
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium" htmlFor="px-w">
                      너비 (px)
                    </label>
                    <input
                      id="px-w"
                      type="number"
                      min={1}
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      placeholder={String(origDims.w)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setLockAspect(!lockAspect)}
                    className="mb-0.5 rounded-lg border border-border p-2 transition-colors hover:bg-muted"
                    title={lockAspect ? "종횡비 잠금 해제" : "종횡비 잠금"}
                  >
                    {lockAspect ? (
                      <LockIcon className="size-4 text-primary" />
                    ) : (
                      <UnlockIcon className="size-4 text-muted-foreground" />
                    )}
                  </button>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium" htmlFor="px-h">
                      높이 (px)
                    </label>
                    <input
                      id="px-h"
                      type="number"
                      min={1}
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      placeholder={String(origDims.h)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
                {lockAspect && (
                  <p className="text-xs text-muted-foreground">
                    종횡비 잠금 상태: 너비 또는 높이 중 하나만 입력하면 나머지가 자동 계산됩니다.
                  </p>
                )}
              </div>
            )}

            {mode === "percent" && (
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="pct">
                  배율 (%)
                </label>
                <input
                  id="pct"
                  type="number"
                  min={1}
                  max={500}
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                {origDims && percent && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    결과 크기: {Math.round(origDims.w * (parseFloat(percent) / 100))} ×{" "}
                    {Math.round(origDims.h * (parseFloat(percent) / 100))}px
                  </p>
                )}
              </div>
            )}

            {mode === "preset" && (
              <div className="flex flex-wrap gap-2">
                {RESIZE_PRESETS.map((p, i) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setPresetIdx(i)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      presetIdx === i
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}

            {mode === "percent" && parseFloat(percent) > 100 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                원본보다 크게 확대하면 화질이 저하될 수 있습니다.
              </p>
            )}
          </div>
        )}

        {mode === "preset" && needsCrop && imageUrl && status === "idle" && (
          <CropSelector
            imageUrl={imageUrl}
            targetWidth={RESIZE_PRESETS[presetIdx].width}
            targetHeight={RESIZE_PRESETS[presetIdx].height}
            onCropChange={handleCropChange}
          />
        )}

        {file && origDims && status === "idle" && (
          <Button className="w-full" size="lg" onClick={handleResize}>
            크기 변경하기
          </Button>
        )}

        {status === "done" && result && (
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="mb-3 text-sm font-medium">변경 결과</p>
            <p className="text-sm">
              {result.originalWidth} × {result.originalHeight}px →{" "}
              <span className="font-semibold text-primary">
                {result.width} × {result.height}px
              </span>
            </p>
            {isUpscale && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                원본보다 크게 확대되었습니다. 화질이 저하될 수 있습니다.
              </p>
            )}
          </div>
        )}

        <ProcessingStatus
          status={status}
          progress={progress}
          errorMessage={errorMessage}
          onRetry={handleRetry}
          onDownload={handleDownload}
          downloadFileName={
            file ? `${file.name.replace(/\.[^.]+$/, "")}-resized.${file.name.split(".").pop()}` : "resized.png"
          }
        />
      </div>
    </div>
  );
}
