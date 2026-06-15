"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/common/FileUpload";
import { OversizeNotice } from "@/components/common/OversizeNotice";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { ToolTopStrip } from "@/components/common/ToolTopStrip";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { uploadLimitFor } from "@/lib/constants";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import {
  analyzePptxForCompress,
  compressPptx,
  type CompressPptxResult,
  type PptxCompressAnalysis,
} from "@/lib/ppt/compressPptx";
import {
  deriveCompressedName,
  type CompressionPreset,
} from "@/lib/ppt/pptCompressPlan";
import { PptCompressControls } from "./PptCompressControls";
import { PptCompressEstimate } from "./PptCompressEstimate";
import { PptCompressPreview } from "./PptCompressPreview";
import { PptCompressResult } from "./PptCompressResult";
import type { PptCompressLabels } from "./labels";

// .pptx only — legacy .ppt (CFB) is rejected by react-dropzone's accept filter.
const PPTX_ACCEPT = {
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
};

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

interface PptCompressProps {
  labels: PptCompressLabels;
  inline?: boolean;
}

export function PptCompress({ labels, inline = false }: PptCompressProps) {
  const [preset, setPreset] = useState<CompressionPreset>("medium");
  const [analysis, setAnalysis] = useState<PptxCompressAnalysis | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
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
    download,
  } = useToolProcessor<CompressPptxResult>({
    processor: (processorFiles, onProgress) =>
      compressPptx({ file: processorFiles[0], preset, onProgress }),
    onDownload: (res) =>
      downloadBlob(
        res.data,
        deriveCompressedName(filesRef.current[0]?.name ?? ""),
        PPTX_MIME,
      ),
    errorOptions: {
      memoryHint: labels.errorMemory,
      corruptOutputHint: labels.errorCorrupt,
    },
  });

  useEffect(() => {
    filesRef.current = files;
  });

  const file = files[0];

  // Analyze once per file: thumbnail + recompressible byte total + counts.
  useEffect(() => {
    if (!file) {
      setAnalysis(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    setAnalyzing(true);
    setAnalysis(null);
    setThumbnailUrl(null);
    (async () => {
      try {
        const res = await analyzePptxForCompress(file);
        if (cancelled) return;
        setAnalysis(res);
        if (res.previewBlob) {
          createdUrl = URL.createObjectURL(res.previewBlob);
          setThumbnailUrl(createdUrl);
        }
      } catch {
        // Analysis failure is non-fatal: compression still works, the preview
        // just shows the placeholder and the estimate falls back to the range.
        if (!cancelled) setAnalysis(null);
      } finally {
        if (!cancelled) setAnalyzing(false);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [file]);

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
      // No size block: ppt-compress exists to shrink large decks, so an oversize
      // file is accepted and the editor shows an advisory instead of rejecting.
      if (picked.length > 0) handleFilesChange(picked);
      e.target.value = "";
    },
    [handleFilesChange, status],
  );

  const onReset = useCallback(() => {
    handleFilesChange([]);
    setPreset("medium");
  }, [handleFilesChange]);

  const handleAgain = useCallback(() => retry(), [retry]);

  const hasFile = !!file;
  const busy = status === "processing";
  const isDone = status === "done" && !!result;

  // Advisory (never blocks): ppt-compress accepts any size, but warns when a deck
  // is large enough that in-browser compression may be slow or fail.
  const [oversizeDismissed, setOversizeDismissed] = useState(false);
  const showOversize =
    !!file &&
    status === "idle" &&
    file.size > uploadLimitFor("ppt-compress") &&
    !oversizeDismissed;

  const fileInfo = file
    ? template(labels.fileInfoTemplate, {
        name: file.name,
        size: formatBytes(file.size),
      })
    : "";

  const handleCompressClick = useCallback(() => {
    if (!file) {
      toast.error(labels.uploadPrompt);
      return;
    }
    run();
  }, [file, run, labels.uploadPrompt]);

  const body = (
    <div className={inline ? "space-y-4" : "space-y-4 px-6 py-3"}>
      <input
        ref={reuploadInputRef}
        type="file"
        accept=".pptx"
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
          hideAutoHint
          maxSize={Number.POSITIVE_INFINITY}
          onFiles={handleFilesChange}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={labels.fileUpload}
        />
      ) : (
        <div className="flex flex-col gap-3" style={{ height: "52vh" }}>
          <ToolTopStrip
            filesSummary={fileInfo}
            meta={
              analysis ? (
                <span
                  className="shrink-0 font-body text-[12px]"
                  style={{ color: "var(--ink-soft)" }}
                >
                  · {template(labels.slideCountTemplate, { n: analysis.slideCount })}
                </span>
              ) : undefined
            }
            onReupload={handleReupload}
            reuploadLabel={labels.reupload}
            busy={busy}
            onExecute={status === "idle" ? handleCompressClick : undefined}
            executeLabel={labels.compress}
          />

          {showOversize && file && (
            <OversizeNotice
              totalBytes={file.size}
              warning={labels.fileUpload.largeFileWarning}
              dismissLabel={labels.fileUpload.dismiss}
              onDismiss={() => setOversizeDismissed(true)}
            />
          )}

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 md:grid-cols-2">
            {/* LEFT: thumbnail preview (persists across states) */}
            <div className="flex h-full min-h-0 flex-col gap-2">
              <PptCompressPreview
                thumbnailUrl={thumbnailUrl}
                analyzing={analyzing}
                imageCount={analysis ? analysis.imageCount : null}
                formatCounts={analysis ? analysis.formatCounts : null}
                labels={labels}
              />
            </div>

            {/* RIGHT: preset → estimate, or result, or status */}
            {isDone && result ? (
              <div className="self-start">
                <PptCompressResult
                  originalSize={result.originalSize}
                  compressedSize={result.compressedSize}
                  onDownload={download}
                  onAgain={handleAgain}
                  labels={labels}
                />
              </div>
            ) : status === "idle" ? (
              <div className="flex h-full flex-col gap-3">
                <PptCompressControls
                  preset={preset}
                  onChange={setPreset}
                  labels={labels}
                  disabled={busy}
                />
                {file && (
                  <PptCompressEstimate
                    preset={preset}
                    originalSize={file.size}
                    labels={labels}
                    jpegBytes={analysis ? analysis.jpegBytes : null}
                    pngBytes={analysis ? analysis.pngBytes : null}
                  />
                )}
              </div>
            ) : (
              <ProcessingStatus
                status={status}
                progress={progress}
                errorMessage={errorMessage}
                onRetry={retry}
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
