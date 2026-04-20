"use client";

import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { Button } from "@/components/ui/button";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { imagesToPdf } from "@/lib/pdf/imageToPdf";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { ImageIcon } from "lucide-react";

const IMAGE_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

export default function ImageToPdfPage() {
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
    processor: (files, onProgress) => imagesToPdf({ files, onProgress }),
    onDownload: (bytes) =>
      downloadBlob(bytes, "images-converted.pdf", "application/pdf"),
  });

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
          <Button className="w-full" size="lg" onClick={run}>
            PDF로 변환 ({files.length}개 이미지)
          </Button>
        )}

        <ProcessingStatus
          status={status}
          progress={progress}
          errorMessage={errorMessage}
          onRetry={retry}
          onDownload={download}
          downloadFileName="images-converted.pdf"
        />
      </div>
    </div>
  );
}
