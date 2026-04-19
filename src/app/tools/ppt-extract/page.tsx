"use client";

import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { Button } from "@/components/ui/button";
import { useToolProcessor } from "@/hooks/useToolProcessor";
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
  const {
    files,
    setFiles,
    status,
    progress,
    errorMessage,
    run,
    retry,
    download,
  } = useToolProcessor<Uint8Array>({
    processor: (files, onProgress) =>
      extractPptImages({ file: files[0], onProgress }),
    onDownload: (bytes) => {
      const baseName = files[0]?.name.replace(/\.pptx?$/i, "") ?? "ppt";
      downloadBlob(bytes, `${baseName}-images.zip`, "application/zip");
    },
  });

  const file = files[0];

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
          <Button className="w-full" size="lg" onClick={run}>
            이미지 추출
          </Button>
        )}

        <ProcessingStatus
          status={status}
          progress={progress}
          errorMessage={errorMessage}
          onRetry={retry}
          onDownload={download}
          downloadFileName={`${file?.name.replace(/\.pptx?$/i, "") ?? "ppt"}-images.zip`}
        />
      </div>
    </div>
  );
}
