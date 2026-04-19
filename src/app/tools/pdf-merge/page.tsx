"use client";

import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { Button } from "@/components/ui/button";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { mergePdfs } from "@/lib/pdf/mergePdf";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { MergeIcon } from "lucide-react";

const PDF_ACCEPT = {
  "application/pdf": [".pdf"],
};

export default function PdfMergePage() {
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
    processor: (files, onProgress) => mergePdfs({ files, onProgress }),
    onDownload: (pdfBytes) =>
      downloadBlob(pdfBytes, "merged.pdf", "application/pdf"),
    errorOptions: {
      memoryHint:
        "브라우저 메모리가 부족합니다. 파일 크기를 줄이거나 파일 수를 줄여주세요.",
    },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MergeIcon className="size-6" />
        </div>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">
          PDF 합치기
        </h1>
        <p className="mt-2 text-muted-foreground">
          여러 PDF 파일을 업로드하면 하나의 파일로 병합합니다.
        </p>
      </div>

      <div className="space-y-6">
        <FileUpload
          accept={PDF_ACCEPT}
          multiple
          onFiles={setFiles}
          label="PDF 파일을 드래그하거나 클릭하여 업로드"
          description="2개 이상의 PDF 파일을 선택하세요. 업로드 순서대로 병합됩니다."
        />

        {files.length >= 2 && status === "idle" && (
          <Button className="w-full" size="lg" onClick={run}>
            PDF 합치기 ({files.length}개 파일)
          </Button>
        )}

        {files.length === 1 && status === "idle" && (
          <p className="text-center text-sm text-muted-foreground">
            PDF 파일을 1개 더 추가해 주세요.
          </p>
        )}

        <ProcessingStatus
          status={status}
          progress={progress}
          errorMessage={errorMessage}
          onRetry={retry}
          onDownload={download}
          downloadFileName="merged.pdf"
        />
      </div>
    </div>
  );
}
