"use client";

import { useCallback, useRef, useState } from "react";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import type { ProcessingState } from "@/types";
import { Button } from "@/components/ui/button";
import { extractPptImages } from "@/lib/ppt/extractImages";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { ImageDownIcon } from "lucide-react";

const PPTX_ACCEPT = {
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
  "application/vnd.ms-powerpoint": [".ppt"],
};

export default function PptExtractPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<ProcessingState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const resultRef = useRef<Uint8Array | null>(null);

  const file = files[0];

  const handleExtract = useCallback(async () => {
    if (!file) return;

    setStatus("processing");
    setProgress(0);
    setErrorMessage("");
    resultRef.current = null;

    try {
      const zipBytes = await extractPptImages({
        file,
        onProgress: setProgress,
      });
      resultRef.current = zipBytes;
      setStatus("done");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
      setErrorMessage(msg);
      setStatus("error");
    }
  }, [file]);

  const handleDownload = useCallback(() => {
    if (!resultRef.current) return;
    const baseName = file?.name.replace(/\.pptx?$/i, "") ?? "ppt";
    downloadBlob(
      resultRef.current,
      `${baseName}-images.zip`,
      "application/zip",
    );
  }, [file]);

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
          <ImageDownIcon className="size-6" />
        </div>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">
          PPT 이미지 추출
        </h1>
        <p className="mt-2 text-muted-foreground">
          PPT/PPTX 파일에 포함된 모든 이미지를 ZIP으로 추출합니다.
        </p>
      </div>

      <div className="space-y-6">
        <FileUpload
          accept={PPTX_ACCEPT}
          multiple={false}
          onFiles={setFiles}
          label="PPT/PPTX 파일을 드래그하거나 클릭하여 업로드"
          description=".ppt 및 .pptx 형식을 지원합니다."
        />

        {file && status === "idle" && (
          <Button className="w-full" size="lg" onClick={handleExtract}>
            이미지 추출
          </Button>
        )}

        <ProcessingStatus
          status={status}
          progress={progress}
          errorMessage={errorMessage}
          onRetry={handleRetry}
          onDownload={handleDownload}
          downloadFileName={`${file?.name.replace(/\.pptx?$/i, "") ?? "ppt"}-images.zip`}
        />
      </div>
    </div>
  );
}
