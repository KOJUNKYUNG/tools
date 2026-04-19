"use client";

import { useCallback, useRef, useState } from "react";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import type { ProcessingState } from "@/types";
import { Button } from "@/components/ui/button";
import { splitPdf, type SplitResult } from "@/lib/pdf/splitPdf";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { ScissorsIcon } from "lucide-react";
import { PDFDocument } from "pdf-lib";

const PDF_ACCEPT = { "application/pdf": [".pdf"] };

type SplitMode = "range" | "all";

export default function PdfSplitPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<SplitMode>("range");
  const [rangeInput, setRangeInput] = useState("");
  const [totalPages, setTotalPages] = useState(0);
  const [status, setStatus] = useState<ProcessingState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const resultRef = useRef<SplitResult | null>(null);

  const handleFilesChange = useCallback(async (newFiles: File[]) => {
    setFiles(newFiles);
    if (newFiles.length > 0) {
      try {
        const bytes = new Uint8Array(await newFiles[0].arrayBuffer());
        const doc = await PDFDocument.load(bytes);
        setTotalPages(doc.getPageCount());
      } catch {
        setTotalPages(0);
      }
    } else {
      setTotalPages(0);
    }
  }, []);

  const handleSplit = useCallback(async () => {
    const file = files[0];
    if (!file) return;

    setStatus("processing");
    setProgress(0);
    setErrorMessage("");
    resultRef.current = null;

    try {
      const result = await splitPdf({
        file,
        mode,
        rangeInput: mode === "range" ? rangeInput : undefined,
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
  }, [files, mode, rangeInput]);

  const handleDownload = useCallback(() => {
    if (!resultRef.current) return;
    const { data, filename, type } = resultRef.current;
    const mime =
      type === "zip" ? "application/zip" : "application/pdf";
    downloadBlob(data, filename, mime);
  }, []);

  const handleRetry = useCallback(() => {
    setStatus("idle");
    setProgress(0);
    setErrorMessage("");
    resultRef.current = null;
  }, []);

  const file = files[0];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ScissorsIcon className="size-6" />
        </div>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">
          PDF 분할
        </h1>
        <p className="mt-2 text-muted-foreground">
          PDF에서 원하는 페이지만 추출하거나, 전체 페이지를 개별 PDF로 분리합니다.
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

        {file && status === "idle" && (
          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            {totalPages > 0 && (
              <p className="text-sm text-muted-foreground">
                전체 <span className="font-semibold text-foreground">{totalPages}</span>페이지
              </p>
            )}

            <div>
              <p className="mb-2 text-sm font-medium">분할 모드</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("range")}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    mode === "range"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  범위 지정
                </button>
                <button
                  type="button"
                  onClick={() => setMode("all")}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    mode === "all"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  전체 분리
                </button>
              </div>
            </div>

            {mode === "range" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="range-input">
                  페이지 범위
                </label>
                <input
                  id="range-input"
                  type="text"
                  value={rangeInput}
                  onChange={(e) => setRangeInput(e.target.value)}
                  placeholder="예: 1-3, 5, 7-9"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  쉼표와 하이픈을 사용하여 범위를 지정하세요.
                </p>
              </div>
            )}

            {mode === "all" && (
              <p className="text-xs text-muted-foreground">
                모든 페이지를 개별 PDF로 분리하여 ZIP 파일로 다운로드합니다.
              </p>
            )}
          </div>
        )}

        {file && status === "idle" && (
          <Button className="w-full" size="lg" onClick={handleSplit}>
            {mode === "range" ? "PDF 추출하기" : `전체 ${totalPages}페이지 분리하기`}
          </Button>
        )}

        <ProcessingStatus
          status={status}
          progress={progress}
          errorMessage={errorMessage}
          onRetry={handleRetry}
          onDownload={handleDownload}
          downloadFileName={
            resultRef.current?.filename ?? "split.pdf"
          }
        />
      </div>
    </div>
  );
}
