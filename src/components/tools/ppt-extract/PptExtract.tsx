"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/common/FileUpload";
import { uploadLimitFor } from "@/lib/constants";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { ToolTopStrip } from "@/components/common/ToolTopStrip";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { stageFiles } from "@/lib/common/toolHandoff";
import { downloadBlobObject } from "@/lib/pdf/downloadBlob";
import { buildExtractZip } from "@/lib/ppt/buildExtractZip";
import type { PresentationAnalysis } from "@/lib/ppt/analyzePresentation";
import {
  extractPptImages,
  type ExtractedImage,
} from "@/lib/ppt/extractImages";
import { PptExtractPreview } from "./PptExtractPreview";
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
  lang?: string;
  inline?: boolean;
}

function baseName(name: string): string {
  return name.replace(/\.pptx?$/i, "") || "ppt";
}

export function PptExtract({ labels, lang = "ko", inline = false }: PptExtractProps) {
  const router = useRouter();
  const reuploadInputRef = useRef<HTMLInputElement | null>(null);
  const filesRef = useRef<File[]>([]);
  // Pulled up from PptExtractPreview so the right-column extract button can
  // disable itself when analysis confirms there are 0 images to extract.
  const [analysis, setAnalysis] = useState<PresentationAnalysis | null>(null);

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
  const noImagesConfirmed = analysis !== null && analysis.imageCount === 0;

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
      setAnalysis(null);
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
      // The dropzone enforces maxSize; this hidden re-upload input bypasses it,
      // so guard here too (mirrors pdf-lock).
      const tooLarge = picked.find((f) => f.size > uploadLimitFor("ppt-extract"));
      if (tooLarge) {
        toast.error(
          template(labels.fileUpload.tooLargeTemplate, {
            name: tooLarge.name,
            size: formatBytes(uploadLimitFor("ppt-extract")),
          }),
        );
        e.target.value = "";
        return;
      }
      if (picked.length > 0) handleFilesChange(picked);
      e.target.value = "";
    },
    [handleFilesChange, status, labels.fileUpload.tooLargeTemplate],
  );

  const onReset = useCallback(() => handleFilesChange([]), [handleFilesChange]);

  const handleExtract = useCallback(() => {
    if (!file) {
      toast.error(labels.uploadPrompt);
      return;
    }
    run();
  }, [file, run, labels.uploadPrompt]);

  // "Start over" semantics — clear file too, return to upload dropzone.
  // (Label is "다시 작업" / "Start over"; pdf-compress's "다시 압축" only retried
  // the same file, but ppt-extract's reset is a full reset.)
  const handleAgain = onReset;

  const handleDownloadAll = useCallback(async () => {
    if (!result) return;
    const zip = await buildExtractZip(result);
    // new Uint8Array(...) is required for TS strict (BlobPart needs
    // Uint8Array<ArrayBuffer>, not <ArrayBufferLike>). Cost is one extra copy
    // at download time only.
    const blob = new Blob([new Uint8Array(zip)], { type: "application/zip" });
    downloadBlobObject(blob, `${baseName(filesRef.current[0]?.name ?? "ppt")}-images.zip`);
  }, [result]);

  const handleDownloadOne = useCallback((image: ExtractedImage) => {
    const blob = new Blob([new Uint8Array(image.data)], { type: image.mime });
    downloadBlobObject(blob, image.name);
  }, []);

  const handleToPptx = useCallback(() => {
    if (!result) return;
    const files = result
      .filter((img) => img.data.length > 0)
      .map((img) => new File([new Uint8Array(img.data)], img.name, { type: img.mime }));
    stageFiles(files, "ppt-extract");
    router.push(`/${lang}/tools/image-to-pptx`);
  }, [result, router, lang]);

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
          maxSize={uploadLimitFor("ppt-extract")}
          onFiles={handleFilesChange}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={{ ...labels.fileUpload, maxSize: labels.uploadMaxSize }}
        />
      ) : isDone && result ? (
        <PptExtractResult
          images={result}
          labels={labels}
          onDownloadAll={handleDownloadAll}
          onDownloadOne={handleDownloadOne}
          onAgain={onReset}
          onToPptx={handleToPptx}
        />
      ) : (
        <div className="flex flex-col gap-3" style={{ height: "var(--tray-h)" }}>
          <ToolTopStrip
            filesSummary={fileInfo}
            onReupload={handleReupload}
            reuploadLabel={labels.reupload}
            busy={busy}
            onExecute={status === "idle" ? handleExtract : undefined}
            executeLabel={
              analysis
                ? template(labels.extractCountTemplate, { n: analysis.imageCount })
                : labels.extract
            }
            executeDisabled={noImagesConfirmed}
          />

          {/* Analysis preview (idle) persists; swaps to status while extracting */}
          <div className="min-h-0 flex-1">
            {status === "idle" ? (
              <PptExtractPreview
                file={file}
                labels={labels}
                onAnalysisChange={setAnalysis}
              />
            ) : (
              <ProcessingStatus
                status={status}
                progress={progress}
                errorMessage={displayError}
                onRetry={handleAgain}
                labels={{ processing: labels.processing }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (inline) return body;

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-[14px] border"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-lg)",
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
        <div className="min-w-0 flex-1">
          <div
            className="font-ko text-[16px] font-medium leading-[1.2] tracking-[0.005em]"
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
