"use client";

import { useCallback, useEffect, useRef } from "react";
import { ImageDownIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { downloadBlobObject } from "@/lib/pdf/downloadBlob";
import { buildExtractZip } from "@/lib/ppt/buildExtractZip";
import {
  extractPptImages,
  type ExtractedImage,
} from "@/lib/ppt/extractImages";
import { PptExtractResult } from "./PptExtractResult";
import type { PptExtractLabels } from "./labels";

const PPTX_ACCEPT = {
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
  "application/vnd.ms-powerpoint": [".ppt"],
};

interface PptExtractProps {
  labels: PptExtractLabels;
  inline?: boolean;
}

function baseName(name: string): string {
  return name.replace(/\.pptx?$/i, "") || "ppt";
}

export function PptExtract({ labels, inline = false }: PptExtractProps) {
  const reuploadInputRef = useRef<HTMLInputElement | null>(null);
  const filesRef = useRef<File[]>([]);

  const {
    files,
    setFiles,
    status,
    progress,
    errorMessage,
    result,
    run,
    retry,
  } = useToolProcessor<ExtractedImage[]>({
    processor: (processorFiles, onProgress) =>
      extractPptImages({ file: processorFiles[0], onProgress }),
    onDownload: () => {
      // Result component drives downloads; this is unused.
    },
  });

  useEffect(() => {
    filesRef.current = files;
  });

  const file = files[0];
  const hasFile = !!file;
  const busy = status === "processing";
  const isDone = status === "done" && !!result;

  const fileInfo = file
    ? template(labels.fileInfoTemplate, {
        name: file.name,
        size: formatBytes(file.size),
      })
    : "";

  const handleFilesChange = useCallback(
    (newFiles: File[]) => {
      retry();
      setFiles(newFiles.slice(0, 1));
    },
    [retry, setFiles],
  );

  const handleReupload = useCallback(
    () => reuploadInputRef.current?.click(),
    [],
  );

  const handleHiddenInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (status === "processing") {
        e.target.value = "";
        return;
      }
      const picked = e.target.files ? Array.from(e.target.files) : [];
      if (picked.length > 0) handleFilesChange(picked);
      e.target.value = "";
    },
    [handleFilesChange, status],
  );

  const onReset = useCallback(() => handleFilesChange([]), [handleFilesChange]);

  const handleExtract = useCallback(() => {
    if (!file) {
      toast.error(labels.uploadPrompt);
      return;
    }
    run();
  }, [file, run, labels.uploadPrompt]);

  const handleAgain = useCallback(() => {
    retry();
  }, [retry]);

  const handleDownloadAll = useCallback(async () => {
    if (!result) return;
    const zip = await buildExtractZip(result);
    const blob = new Blob([new Uint8Array(zip)], { type: "application/zip" });
    downloadBlobObject(blob, `${baseName(filesRef.current[0]?.name ?? "ppt")}-images.zip`);
  }, [result]);

  const handleDownloadOne = useCallback((image: ExtractedImage) => {
    const blob = new Blob([new Uint8Array(image.data)], { type: image.mime });
    downloadBlobObject(blob, image.name);
  }, []);

  // Localise the NO_IMAGES sentinel from the extractors.
  const displayError =
    errorMessage === "NO_IMAGES" ? labels.errorNoImages : errorMessage;

  const body = (
    <div className={inline ? "space-y-4" : "space-y-4 px-6 py-3"}>
      <input
        ref={reuploadInputRef}
        type="file"
        accept=".ppt,.pptx"
        onChange={handleHiddenInputChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {!hasFile ? (
        <FileUpload
          accept={PPTX_ACCEPT}
          multiple={false}
          hideFileList
          onFiles={handleFilesChange}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={{ maxSize: labels.uploadMaxSize }}
        />
      ) : isDone && result ? (
        <PptExtractResult
          images={result}
          labels={labels}
          onDownloadAll={handleDownloadAll}
          onDownloadOne={handleDownloadOne}
          onAgain={onReset}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div
              className="min-w-0 truncate font-body text-[12px]"
              style={{ color: "var(--ink)" }}
              title={fileInfo}
            >
              {fileInfo}
            </div>
            <button
              type="button"
              onClick={handleReupload}
              disabled={busy}
              className="shrink-0 rounded-[5px] border px-2.5 py-1 font-display text-[11px] transition-colors hover:border-[color:var(--accent-electric)] disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border)",
                color: "var(--ink-strong)",
              }}
            >
              {labels.reupload}
            </button>
          </div>

          {status === "idle" && (
            <button
              type="button"
              onClick={handleExtract}
              className="btn-primary glint inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[9px] px-4 font-display text-[13px] font-semibold"
            >
              {labels.extract}
            </button>
          )}

          <ProcessingStatus
            status={status}
            progress={progress}
            errorMessage={displayError}
            onRetry={handleAgain}
            labels={{ processing: labels.processing }}
          />
        </div>
      )}
    </div>
  );

  if (inline) return body;

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-[14px] border"
      style={{
        background: "color-mix(in oklch, var(--surface) 92%, transparent)",
        backdropFilter: "blur(10px) saturate(1.1)",
        WebkitBackdropFilter: "blur(10px) saturate(1.1)",
        borderColor: "var(--border)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 48px -16px rgba(20,30,60,0.28), 0 8px 20px -6px rgba(20,30,60,0.16)",
      }}
    >
      <button
        type="button"
        onClick={onReset}
        disabled={busy}
        aria-label={labels.reset}
        title={labels.reset}
        className="absolute right-6 top-4 z-10 rounded-md p-1.5 transition-colors hover:text-[color:var(--ink-strong)] disabled:cursor-not-allowed disabled:opacity-50"
        style={{ color: "var(--ink-soft)" }}
      >
        <RotateCcwIcon className="size-4" />
      </button>
      <div
        className="flex items-start gap-3 border-b px-6 pb-3 pt-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-[5px]"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--ink-strong)",
          }}
        >
          <ImageDownIcon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="font-display font-ko text-[16px] font-semibold leading-[1.2] tracking-[0.005em]"
            style={{ color: "var(--headline)" }}
          >
            {labels.title}
          </div>
          <div
            className="mt-1 font-body text-[12px] leading-[1.45]"
            style={{ color: "var(--ink)" }}
          >
            {labels.description}
          </div>
        </div>
      </div>
      {body}
    </div>
  );
}
