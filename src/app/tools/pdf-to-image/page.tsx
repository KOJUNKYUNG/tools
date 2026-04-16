"use client";

import { useCallback, useRef, useState } from "react";
import JSZip from "jszip";
import { FileUpload } from "@/components/common/FileUpload";
import {
  ProcessingStatus,
  type ProcessingState,
} from "@/components/common/ProcessingStatus";
import { Button } from "@/components/ui/button";
import {
  pdfToImages,
  type ConvertedImage,
  type OutputFormat,
  type DpiOption,
} from "@/lib/pdf/pdfToImage";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { FileOutputIcon } from "lucide-react";

const PDF_ACCEPT = { "application/pdf": [".pdf"] };

const FORMAT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: "image/jpeg", label: "JPG" },
  { value: "image/png", label: "PNG" },
];

const DPI_OPTIONS: { value: DpiOption; label: string }[] = [
  { value: 72, label: "72 DPI (화면용)" },
  { value: 150, label: "150 DPI (일반)" },
  { value: 300, label: "300 DPI (고화질)" },
];

export default function PdfToImagePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<OutputFormat>("image/jpeg");
  const [dpi, setDpi] = useState<DpiOption>(150);
  const [status, setStatus] = useState<ProcessingState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const resultRef = useRef<ConvertedImage[] | null>(null);

  const handleConvert = useCallback(async () => {
    const file = files[0];
    if (!file) return;

    setStatus("processing");
    setProgress(0);
    setErrorMessage("");
    resultRef.current = null;

    try {
      const images = await pdfToImages({
        file,
        format,
        dpi,
        onProgress: setProgress,
      });
      resultRef.current = images;
      setStatus("done");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
      if (msg.includes("memory") || msg.includes("OOM")) {
        setErrorMessage(
          "브라우저 메모리가 부족합니다. DPI를 낮추거나 페이지가 적은 PDF를 사용해 주세요.",
        );
      } else {
        setErrorMessage(msg);
      }
      setStatus("error");
    }
  }, [files, format, dpi]);

  const handleDownload = useCallback(async () => {
    const images = resultRef.current;
    if (!images || images.length === 0) return;

    if (images.length === 1) {
      const buf = await images[0].blob.arrayBuffer();
      const mime = format === "image/png" ? "image/png" : "image/jpeg";
      downloadBlob(new Uint8Array(buf), images[0].name, mime);
      return;
    }

    const zip = new JSZip();
    for (const img of images) {
      zip.file(img.name, img.blob);
    }
    const zipBytes = await zip.generateAsync({ type: "uint8array" });
    downloadBlob(zipBytes, "pdf-images.zip", "application/zip");
  }, [format]);

  const handleRetry = useCallback(() => {
    setStatus("idle");
    setProgress(0);
    setErrorMessage("");
    resultRef.current = null;
  }, []);

  const file = files[0];
  const downloadFileName =
    resultRef.current && resultRef.current.length === 1
      ? resultRef.current[0].name
      : "pdf-images.zip";

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileOutputIcon className="size-6" />
        </div>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">
          PDF → 이미지 변환
        </h1>
        <p className="mt-2 text-muted-foreground">
          PDF 파일의 각 페이지를 JPG 또는 PNG 이미지로 추출합니다.
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
            <div>
              <p className="mb-2 text-sm font-medium">출력 형식</p>
              <div className="flex gap-2">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormat(opt.value)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      format === opt.value
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
              <p className="mb-2 text-sm font-medium">해상도 (DPI)</p>
              <div className="flex flex-wrap gap-2">
                {DPI_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDpi(opt.value)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      dpi === opt.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {dpi === 300 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                고해상도(300 DPI) 변환은 대용량 PDF에서 메모리를 많이 사용할 수
                있습니다.
              </p>
            )}
          </div>
        )}

        {file && status === "idle" && (
          <Button className="w-full" size="lg" onClick={handleConvert}>
            이미지로 변환
          </Button>
        )}

        <ProcessingStatus
          status={status}
          progress={progress}
          errorMessage={errorMessage}
          onRetry={handleRetry}
          onDownload={handleDownload}
          downloadFileName={downloadFileName}
        />
      </div>
    </div>
  );
}
