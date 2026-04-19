"use client";

import { useCallback, useRef, useState } from "react";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import type { ProcessingState } from "@/types";
import { Button } from "@/components/ui/button";
import {
  compressPdf,
  type CompressionPreset,
  type CompressPdfResult,
} from "@/lib/pdf/compressPdf";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { ArchiveIcon } from "lucide-react";

const PDF_ACCEPT = { "application/pdf": [".pdf"] };

const PRESET_OPTIONS: { value: CompressionPreset; label: string; desc: string }[] = [
  { value: "low", label: "Light", desc: "화질 유지, 10~30% 감소" },
  { value: "medium", label: "Medium", desc: "범용, 30~60% 감소" },
  { value: "high", label: "Heavy", desc: "강한 압축, 60~80% 감소" },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function PdfCompressPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [preset, setPreset] = useState<CompressionPreset>("medium");
  const [status, setStatus] = useState<ProcessingState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const resultRef = useRef<CompressPdfResult | null>(null);

  const handleCompress = useCallback(async () => {
    const file = files[0];
    if (!file) return;

    setStatus("processing");
    setProgress(0);
    setErrorMessage("");
    resultRef.current = null;

    try {
      const result = await compressPdf({
        file,
        preset,
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
  }, [files, preset]);

  const handleDownload = useCallback(() => {
    if (!resultRef.current) return;
    downloadBlob(resultRef.current.data, "compressed.pdf", "application/pdf");
  }, []);

  const handleRetry = useCallback(() => {
    setStatus("idle");
    setProgress(0);
    setErrorMessage("");
    resultRef.current = null;
  }, []);

  const file = files[0];
  const result = resultRef.current;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ArchiveIcon className="size-6" />
        </div>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">
          PDF 압축
        </h1>
        <p className="mt-2 text-muted-foreground">
          PDF 파일 용량을 줄입니다. 파일이 서버에 전송되지 않아 안전합니다.
        </p>
      </div>

      <div className="space-y-6">
        <FileUpload
          accept={PDF_ACCEPT}
          multiple={false}
          onFiles={setFiles}
          label="PDF 파일을 드래그하거나 클릭하여 업로드"
          description="단일 PDF 파일을 선택하세요."
        />

        {file && status === "idle" && (
          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            <p className="mb-2 text-sm font-medium">압축 레벨</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPreset(opt.value)}
                  className={`flex flex-col items-start rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                    preset === opt.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  <span className="font-medium">{opt.label}</span>
                  <span
                    className={`text-xs ${
                      preset === opt.value
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground"
                    }`}
                  >
                    {opt.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {file && status === "idle" && (
          <Button className="w-full" size="lg" onClick={handleCompress}>
            PDF 압축하기
          </Button>
        )}

        {status === "done" && result && (
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="mb-3 text-sm font-medium">압축 결과</p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">원본 크기</p>
                <p className="text-lg font-semibold">
                  {formatBytes(result.originalSize)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">압축 후</p>
                <p className="text-lg font-semibold text-primary">
                  {formatBytes(result.compressedSize)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">절감률</p>
                <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                  {Math.round((1 - result.ratio) * 100)}%
                </p>
              </div>
            </div>
          </div>
        )}

        <ProcessingStatus
          status={status}
          progress={progress}
          errorMessage={errorMessage}
          onRetry={handleRetry}
          onDownload={handleDownload}
          downloadFileName="compressed.pdf"
        />
      </div>
    </div>
  );
}
