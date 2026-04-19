"use client";

import { useCallback, useRef, useState } from "react";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import type { ProcessingState } from "@/types";
import { Button } from "@/components/ui/button";
import { PageGrid } from "@/components/pdf/PageGrid";
import {
  generateThumbnails,
  rebuildPdf,
  type PageInfo,
} from "@/lib/pdf/managePages";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { FileStackIcon } from "lucide-react";

const PDF_ACCEPT = { "application/pdf": [".pdf"] };

export default function PdfPagesPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [status, setStatus] = useState<ProcessingState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);
  const resultRef = useRef<Uint8Array | null>(null);

  const handleFilesChange = useCallback(async (newFiles: File[]) => {
    setFiles(newFiles);
    setPages([]);
    resultRef.current = null;
    setStatus("idle");

    if (newFiles.length > 0) {
      setLoadingThumbnails(true);
      try {
        const thumbs = await generateThumbnails(newFiles[0], setProgress);
        setPages(thumbs);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "썸네일 생성 실패";
        setErrorMessage(msg);
      } finally {
        setLoadingThumbnails(false);
        setProgress(0);
      }
    }
  }, []);

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

  const handleApply = useCallback(async () => {
    const file = files[0];
    if (!file || pages.length === 0) return;

    setStatus("processing");
    setProgress(0);
    setErrorMessage("");
    resultRef.current = null;

    try {
      const result = await rebuildPdf({
        file,
        pages,
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
  }, [files, pages]);

  const handleDownload = useCallback(() => {
    if (!resultRef.current) return;
    downloadBlob(resultRef.current, "managed.pdf", "application/pdf");
  }, []);

  const handleRetry = useCallback(() => {
    setStatus("idle");
    setProgress(0);
    setErrorMessage("");
    resultRef.current = null;
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
            썸네일을 생성하는 중… {Math.round(progress)}%
          </div>
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
              onClick={handleApply}
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
          onRetry={handleRetry}
          onDownload={handleDownload}
          downloadFileName="managed.pdf"
        />
      </div>
    </div>
  );
}
