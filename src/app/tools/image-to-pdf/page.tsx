"use client";

import { useCallback, useRef, useState } from "react";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import type { ProcessingState } from "@/types";
import { Button } from "@/components/ui/button";
import { imagesToPdf } from "@/lib/pdf/imageToPdf";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { ImageIcon } from "lucide-react";

const IMAGE_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

export default function ImageToPdfPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<ProcessingState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const resultRef = useRef<Uint8Array | null>(null);

  const handleConvert = useCallback(async () => {
    if (files.length === 0) return;

    setStatus("processing");
    setProgress(0);
    setErrorMessage("");
    resultRef.current = null;

    try {
      const pdfBytes = await imagesToPdf({
        files,
        onProgress: setProgress,
      });
      resultRef.current = pdfBytes;
      setStatus("done");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
      setErrorMessage(msg);
      setStatus("error");
    }
  }, [files]);

  const handleDownload = useCallback(() => {
    if (!resultRef.current) return;
    downloadBlob(resultRef.current, "images-converted.pdf", "application/pdf");
  }, []);

  const handleRetry = useCallback(() => {
    setStatus("idle");
    setProgress(0);
    setErrorMessage("");
    resultRef.current = null;
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ImageIcon className="size-6" />
        </div>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">
          이미지 → PDF 변환
        </h1>
        <p className="mt-2 text-muted-foreground">
          JPG/PNG 이미지를 업로드하면 하나의 PDF 파일로 변환합니다.
        </p>
      </div>

      <div className="space-y-6">
        <FileUpload
          accept={IMAGE_ACCEPT}
          multiple
          onFiles={setFiles}
          label="이미지를 드래그하거나 클릭하여 업로드"
          description="JPG, PNG 파일을 지원합니다. 여러 파일을 한 번에 업로드할 수 있습니다."
        />

        {files.length > 0 && status === "idle" && (
          <Button className="w-full" size="lg" onClick={handleConvert}>
            PDF로 변환 ({files.length}개 이미지)
          </Button>
        )}

        <ProcessingStatus
          status={status}
          progress={progress}
          errorMessage={errorMessage}
          onRetry={handleRetry}
          onDownload={handleDownload}
          downloadFileName="images-converted.pdf"
        />
      </div>
    </div>
  );
}
