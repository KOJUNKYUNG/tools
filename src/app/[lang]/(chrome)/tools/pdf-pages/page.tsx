"use client";

import { useCallback, useState } from "react";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { Button } from "@/components/ui/button";
import { PageGrid } from "@/components/pdf/PageGrid";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import {
  generateThumbnails,
  rebuildPdf,
  type PageInfo,
} from "@/lib/pdf/managePages";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { getErrorMessage } from "@/lib/errors";
import { FileStackIcon } from "lucide-react";

const PDF_ACCEPT = { "application/pdf": [".pdf"] };

export default function PdfPagesPage() {
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);
  const [thumbProgress, setThumbProgress] = useState(0);
  const [thumbError, setThumbError] = useState("");

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
      rebuildPdf({ file: files[0], pages, onProgress }),
    onDownload: (bytes) =>
      downloadBlob(bytes, "managed.pdf", "application/pdf"),
  });

  const handleFilesChange = useCallback(
    async (newFiles: File[]) => {
      setFiles(newFiles);
      setPages([]);
      setThumbError("");

      if (newFiles.length === 0) return;

      setLoadingThumbnails(true);
      setThumbProgress(0);
      try {
        const thumbs = await generateThumbnails(newFiles[0], setThumbProgress);
        setPages(thumbs);
      } catch (err) {
        setThumbError(
          getErrorMessage(err, { fallbackMessage: "썸네일 생성 실패" }).message,
        );
      } finally {
        setLoadingThumbnails(false);
        setThumbProgress(0);
      }
    },
    [setFiles],
  );

  const handleRotate = useCallback((id: string) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, rotation: (p.rotation + 90) % 360 } : p,
      ),
    );
  }, []);

  const handleDelete = useCallback((id: string) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, deleted: !p.deleted } : p,
      ),
    );
  }, []);

  const handleReorder = useCallback((reordered: PageInfo[]) => {
    setPages(reordered);
  }, []);

  const activeCount = pages.filter((p) => !p.deleted).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8">
        <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileStackIcon className="size-6" />
        </div>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">
          PDF 페이지 관리
        </h1>
        <p className="mt-2 text-muted-foreground">
          페이지를 드래그하여 순서를 변경하고, 회전하거나 삭제한 뒤 새 PDF로
          다운로드합니다.
        </p>
      </div>

      <div className="space-y-6">
        <FileUpload
          accept={PDF_ACCEPT}
          multiple={false}
          onFiles={handleFilesChange}
          label="PDF 파일을 드래그하거나 클릭하여 업로드"
          description="단일 PDF 파일을 선택하세요."
        />

        {loadingThumbnails && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            썸네일을 생성하는 중… {Math.round(thumbProgress)}%
          </div>
        )}

        {thumbError && (
          <p className="text-sm text-destructive">{thumbError}</p>
        )}

        {pages.length > 0 && status === "idle" && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                전체 {pages.length}페이지 · 활성 {activeCount}페이지
              </span>
            </div>

            <PageGrid
              pages={pages}
              onReorder={handleReorder}
              onRotate={handleRotate}
              onDelete={handleDelete}
            />

            <Button
              className="w-full"
              size="lg"
              onClick={run}
              disabled={activeCount === 0}
            >
              PDF 생성하기 ({activeCount}페이지)
            </Button>
          </>
        )}

        <ProcessingStatus
          status={status}
          progress={progress}
          errorMessage={errorMessage}
          onRetry={retry}
          onDownload={download}
          downloadFileName="managed.pdf"
        />
      </div>
    </div>
  );
}
