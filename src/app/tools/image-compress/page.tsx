"use client";

import { useCallback, useRef, useState } from "react";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import type { ProcessingState } from "@/types";
import { Button } from "@/components/ui/button";
import {
  compressImages,
  type CompressResult,
  type OutputFormat,
} from "@/lib/image/compressImage";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { ImageMinusIcon } from "lucide-react";

const IMAGE_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

const FORMAT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: "image/jpeg", label: "JPG" },
  { value: "image/png", label: "PNG" },
  { value: "image/webp", label: "WebP" },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function ImageCompressPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("image/jpeg");
  const [quality, setQuality] = useState(80);
  const [status, setStatus] = useState<ProcessingState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const resultRef = useRef<CompressResult | null>(null);

  const handleCompress = useCallback(async () => {
    if (files.length === 0) return;

    setStatus("processing");
    setProgress(0);
    setErrorMessage("");
    resultRef.current = null;

    try {
      const result = await compressImages({
        files,
        quality,
        outputFormat,
        onProgress: setProgress,
      });
      resultRef.current = result;
      setStatus("done");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
      setErrorMessage(msg);
      setStatus("error");
    }
  }, [files, quality, outputFormat]);

  const handleDownload = useCallback(() => {
    if (!resultRef.current) return;
    const { data, filename, type } = resultRef.current;
    const mime = type === "zip" ? "application/zip" : outputFormat;
    downloadBlob(data, filename, mime);
  }, [outputFormat]);

  const handleRetry = useCallback(() => {
    setStatus("idle");
    setProgress(0);
    setErrorMessage("");
    resultRef.current = null;
  }, []);

  const result = resultRef.current;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ImageMinusIcon className="size-6" />
        </div>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">
          이미지 압축 · 포맷 변환
        </h1>
        <p className="mt-2 text-muted-foreground">
          JPG/PNG/WebP 이미지를 압축하거나 다른 형식으로 변환합니다.
        </p>
      </div>

      <div className="space-y-6">
        <FileUpload
          accept={IMAGE_ACCEPT}
          multiple
          onFiles={setFiles}
          label="이미지를 드래그하거나 클릭하여 업로드"
          description="JPG, PNG, WebP 파일을 지원합니다. 여러 파일을 한 번에 업로드할 수 있습니다."
        />

        {files.length > 0 && status === "idle" && (
          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            <div>
              <p className="mb-2 text-sm font-medium">출력 형식</p>
              <div className="flex gap-2">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setOutputFormat(opt.value)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      outputFormat === opt.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">품질</p>
                <span className="text-sm font-semibold text-primary">
                  {quality}%
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>고압축</span>
                <span>고품질</span>
              </div>
            </div>
          </div>
        )}

        {files.length > 0 && status === "idle" && (
          <Button className="w-full" size="lg" onClick={handleCompress}>
            이미지 압축하기 ({files.length}개)
          </Button>
        )}

        {status === "done" && result && (
          <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
            <p className="mb-2 text-sm font-medium">압축 결과</p>
            {result.images.map((img, i) => {
              const saved = img.originalSize - img.compressedSize;
              const pct =
                img.originalSize > 0
                  ? Math.round((saved / img.originalSize) * 100)
                  : 0;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  <span className="flex-1 truncate">{img.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatBytes(img.originalSize)} → {formatBytes(img.compressedSize)}
                  </span>
                  <span
                    className={`ml-2 shrink-0 text-xs font-medium ${
                      pct > 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {pct > 0 ? `-${pct}%` : "±0%"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <ProcessingStatus
          status={status}
          progress={progress}
          errorMessage={errorMessage}
          onRetry={handleRetry}
          onDownload={handleDownload}
          downloadFileName={resultRef.current?.filename ?? "compressed.jpg"}
        />
      </div>
    </div>
  );
}
