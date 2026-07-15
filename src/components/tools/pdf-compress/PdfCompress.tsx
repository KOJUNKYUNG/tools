"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileUpload } from "@/components/common/FileUpload";
import { OversizeNotice } from "@/components/common/OversizeNotice";
import { uploadLimitFor } from "@/lib/constants";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { ToolHeader } from "@/components/common/ToolHeader";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { consumeStagedFiles } from "@/lib/common/toolHandoff";
import { analyzePdf } from "@/lib/pdf/analyzePdf";
import {
  compressPdf,
  compressPdfLivePreview,
  type CompressionPreset,
  type CompressPdfResult,
} from "@/lib/pdf/compressPdf";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { extractPageOne } from "@/lib/pdf/extractPageOne";
import { deriveCompressedName } from "@/lib/pdf/pdfCompressNaming";
import { ComparePreview, renderPdfFirstPage } from "./ComparePreview";
import { PdfCompressControls } from "./PdfCompressControls";
import { PdfCompressEstimate } from "./PdfCompressEstimate";
import { PdfCompressResult } from "./PdfCompressResult";
import type { PdfCompressLabels } from "./labels";

const PDF_ACCEPT = { "application/pdf": [".pdf"] };

interface PdfCompressProps {
  labels: PdfCompressLabels;
  inline?: boolean;
}

export function PdfCompress({ labels, inline = false }: PdfCompressProps) {
  const [preset, setPreset] = useState<CompressionPreset>("medium");
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [showCompressed, setShowCompressed] = useState(true);
  const reuploadInputRef = useRef<HTMLInputElement | null>(null);

  // Live preview state — driven by (file, preset) while in idle.
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const [livePreviewLoading, setLivePreviewLoading] = useState(false);
  // imageShare: fraction of file bytes that are images (0..1); null = pending/failed.
  const [imageShare, setImageShare] = useState<number | null>(null);
  const livePreviewTokenRef = useRef(0);

  // filesRef gives onDownload a stable reference to the current files array
  // without creating a circular type dependency (TS7022/7023).
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
  } = useToolProcessor<CompressPdfResult>({
    processor: (processorFiles, onProgress) =>
      compressPdf({ file: processorFiles[0], preset, onProgress }),
    onDownload: (res) =>
      downloadBlob(
        res.data,
        deriveCompressedName(filesRef.current[0]?.name ?? ""),
        "application/pdf",
      ),
    errorOptions: {
      memoryHint: labels.errorMemory,
      corruptOutputHint: labels.errorCorrupt,
    },
  });

  // Keep filesRef in sync so onDownload always sees the current file name.
  useEffect(() => {
    filesRef.current = files;
  });

  const file = files[0];

  // Consume cross-tool handoff (e.g. from image-to-pdf). Once on mount.
  useEffect(() => {
    const staged = consumeStagedFiles();
    if (staged && staged.files.length > 0) setFiles(staged.files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render the original-PDF page-1 preview whenever the file changes.
  // Pass bytes.slice() to renderPdfFirstPage to avoid pdfjs detaching the
  // buffer we just read (pitfall i, defense in depth).
  useEffect(() => {
    if (!file) {
      setOriginalUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const ab = await file.arrayBuffer();
        const bytes = new Uint8Array(ab);
        const blob = await renderPdfFirstPage(bytes.slice());
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setOriginalUrl(createdUrl);
      } catch {
        if (!cancelled) {
          setOriginalUrl(null);
          // Render failure is not fatal — compression still works.
        }
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [file]);

  // Render the compressed-PDF page-1 preview whenever a new result arrives.
  // result.data is reused by downloadBlob → MUST slice() to keep it intact
  // (pitfall i).
  useEffect(() => {
    if (!result) {
      setCompressedUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const blob = await renderPdfFirstPage(result.data.slice());
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setCompressedUrl(createdUrl);
        setShowCompressed(true);
      } catch {
        if (!cancelled) setCompressedUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [result]);

  // Clear live preview when the file changes (the live effect will regenerate).
  useEffect(() => {
    setLivePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setImageShare(null);
  }, [file]);

  // Analyze the PDF once per file to determine the image content share.
  // This drives the smarter estimate in PdfCompressEstimate.
  useEffect(() => {
    if (!file) {
      setImageShare(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const analysis = await analyzePdf(file);
        if (cancelled) return;
        if (analysis.isEncrypted) {
          setImageShare(null);
          return;
        }
        setImageShare(
          Math.min(1, analysis.totalImageBytes / Math.max(file.size, 1)),
        );
      } catch {
        if (!cancelled) setImageShare(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Generate a live compressed preview of page 1 while in idle state.
  // Debounced 400ms; token-guarded against stale async responses.
  useEffect(() => {
    if (!file || status !== "idle") {
      livePreviewTokenRef.current++;
      setLivePreviewLoading(false);
      return;
    }
    const token = ++livePreviewTokenRef.current;
    setLivePreviewLoading(true);
    const timer = setTimeout(async () => {
      let createdUrl: string | null = null;
      let committed = false;
      try {
        const ab = await file.arrayBuffer();
        const onePage = await extractPageOne(new Uint8Array(ab));
        // skipIntegrityCheck: live preview operates on a single extracted
        // page, where the multi-page ratio guard would false-positive.
        const liveResult = await compressPdfLivePreview({
          bytes: onePage,
          preset,
          skipIntegrityCheck: true,
        });
        if (token !== livePreviewTokenRef.current) return;
        const blob = await renderPdfFirstPage(liveResult.data.slice());
        if (token !== livePreviewTokenRef.current) return;
        createdUrl = URL.createObjectURL(blob);
        if (token !== livePreviewTokenRef.current) return; // final check before commit
        setLivePreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return createdUrl;
        });
        committed = true;
      } catch {
        // Keep previous livePreviewUrl on failure — better than flicker.
      } finally {
        // Revoke if we created a URL but never committed it (stale token race).
        if (createdUrl && !committed) URL.revokeObjectURL(createdUrl);
        // Always clear loading — fixes stuck spinner on encrypted/failed PDFs.
        setLivePreviewLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [file, preset, status]);

  // Revoke livePreviewUrl on unmount only.
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      livePreviewTokenRef.current++;
      setLivePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
    // empty deps — runs only on unmount
  }, []);

  const handleFilesChange = useCallback(
    (newFiles: File[]) => {
      retry();
      setFiles(newFiles.slice(0, 1));
      setShowCompressed(true);
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
      // No size block: pdf-compress exists to shrink large PDFs, so an oversize
      // file is accepted and the editor shows an advisory instead of rejecting.
      if (picked.length > 0) handleFilesChange(picked);
      e.target.value = "";
    },
    [handleFilesChange, status],
  );

  const handleAgain = useCallback(() => {
    retry();
    setShowCompressed(true);
  }, [retry]);

  const hasFile = !!file;
  const busy = status === "processing";
  const isDone = status === "done" && !!result;

  // Advisory (never blocks): pdf-compress accepts any size, but warns when a file
  // is large enough that in-browser compression may be slow or fail.
  const [oversizeDismissed, setOversizeDismissed] = useState(false);
  const showOversize =
    !!file &&
    status === "idle" &&
    file.size > uploadLimitFor("pdf-compress") &&
    !oversizeDismissed;

  // Unified compressed candidate: authoritative result in done state, live preview otherwise.
  const compressedCandidate = isDone ? compressedUrl : livePreviewUrl;
  // Checkbox is now active in idle too — once livePreviewUrl arrives, the user can toggle.
  const showToggle = !!compressedCandidate;

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

  const header = (
    <ToolHeader
      title={labels.title}
      description={labels.description}
      hasFile={hasFile}
      fileSummary={fileInfo}
      status={status}
      onReupload={handleReupload}
      reuploadLabel={labels.reupload}
      busy={busy}
      executeLabel={labels.compress}
      processingLabel={labels.processing}
      againLabel={labels.again}
      onExecute={handleCompressClick}
      onAgain={handleAgain}
    />
  );

  const body = (
    <div className={inline ? "space-y-4" : "space-y-4 px-6 py-3"}>
      <input
        ref={reuploadInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleHiddenInputChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {!hasFile ? (
        <FileUpload
          accept={PDF_ACCEPT}
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
        <div className="flex flex-col gap-3" style={{ height: "var(--tray-h)" }}>
          {showOversize && file && (
            <OversizeNotice
              totalBytes={file.size}
              warning={labels.fileUpload.largeFileWarning}
              dismissLabel={labels.fileUpload.dismiss}
              onDismiss={() => setOversizeDismissed(true)}
            />
          )}

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 md:grid-cols-2">
            {/* LEFT: preview frame (persists) → compare checkbox */}
            <div className="flex h-full flex-col gap-2">
              <ComparePreview
                originalUrl={originalUrl}
                compressedUrl={compressedCandidate}
                showCompressed={showCompressed && showToggle}
                loading={livePreviewLoading && status === "idle"}
              />
              <div className="flex h-7 items-center justify-end">
                <label
                  className="inline-flex cursor-pointer select-none items-center gap-1.5 font-body text-[11px]"
                  style={{
                    color: showToggle ? "var(--ink-strong)" : "var(--ink-soft)",
                    opacity: showToggle ? 1 : 0.4,
                    pointerEvents: showToggle ? "auto" : "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showCompressed}
                    onChange={(e) => setShowCompressed(e.target.checked)}
                    disabled={!showToggle}
                    aria-label={labels.compareToggleAria}
                    style={{ accentColor: "var(--emphasis)" }}
                  />
                  {labels.comparePreview}
                </label>
              </div>
            </div>

            {/* RIGHT: preset row → estimate, or result, or status */}
            {isDone && result ? (
              <div className="self-start">
                <PdfCompressResult
                  originalSize={result.originalSize}
                  compressedSize={result.compressedSize}
                  onDownload={download}
                  labels={labels}
                />
              </div>
            ) : status === "idle" ? (
              <div className="flex h-full flex-col gap-3">
                <PdfCompressControls
                  preset={preset}
                  onChange={setPreset}
                  labels={labels}
                  disabled={busy}
                />
                {file && (
                  <PdfCompressEstimate
                    preset={preset}
                    originalSize={file.size}
                    labels={labels}
                    imageShare={imageShare}
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

  if (inline)
    return (
      <>
        <div className="border-b pb-3" style={{ borderColor: "var(--border)" }}>
          {header}
        </div>
        {body}
      </>
    );

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-[14px] border"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      <div className="border-b px-6 pb-3 pt-3" style={{ borderColor: "var(--border)" }}>
        {header}
      </div>
      {body}
    </div>
  );
}
