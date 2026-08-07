"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileUpload } from "@/components/common/FileUpload";
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
  compressPdfFromBytes,
  type CompressionPreset,
  type CompressPdfResult,
} from "@/lib/pdf/compressPdf";
import { shouldPreviewCompress } from "@/lib/pdf/livePreviewGate";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { deriveCompressedName } from "@/lib/pdf/pdfCompressNaming";
import { ComparePreview, renderPdfFirstPage } from "./ComparePreview";
import { PdfCompressControls } from "./PdfCompressControls";
import { PdfCompressEstimate } from "./PdfCompressEstimate";
import { PdfCompressResult } from "./PdfCompressResult";
import type { PdfCompressLabels } from "./labels";

const PDF_ACCEPT = { "application/pdf": [".pdf"] };

// Render page-1 previews at high resolution so the in-frame click-to-zoom
// (up to 4×) stays reasonably sharp.
const PREVIEW_WIDTH = 1500;
const PREVIEW_MAX_SCALE = 3;

interface PdfCompressProps {
  labels: PdfCompressLabels;
  inline?: boolean;
}

export function PdfCompress({ labels, inline = false }: PdfCompressProps) {
  const [preset, setPreset] = useState<CompressionPreset>("medium");
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const reuploadInputRef = useRef<HTMLInputElement | null>(null);

  // Live preview: faithful whole-doc compress of the current preset (gated by size).
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const [livePreviewLoading, setLivePreviewLoading] = useState(false);
  const [liveResult, setLiveResult] = useState<CompressPdfResult | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [imageShare, setImageShare] = useState<number | null>(null);
  const livePreviewTokenRef = useRef(0);
  // Precompute cache: preset -> whole-doc result for the CURRENT file. Cleared on file change.
  const previewCacheRef = useRef<Map<CompressionPreset, CompressPdfResult>>(new Map());

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
    processor: async (processorFiles, onProgress) => {
      const cached = previewCacheRef.current.get(preset);
      if (cached) {
        // The live preview already compressed the whole doc at this preset.
        onProgress(100);
        return cached;
      }
      return compressPdf({ file: processorFiles[0], preset, onProgress });
    },
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
        const blob = await renderPdfFirstPage(bytes.slice(), PREVIEW_WIDTH, PREVIEW_MAX_SCALE);
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
        const blob = await renderPdfFirstPage(result.data.slice(), PREVIEW_WIDTH, PREVIEW_MAX_SCALE);
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setCompressedUrl(createdUrl);
      } catch {
        if (!cancelled) setCompressedUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [result]);

  // Reset all per-file preview state when the file changes.
  useEffect(() => {
    previewCacheRef.current = new Map();
    setLiveResult(null);
    setPageCount(null);
    setImageShare(null);
    setLivePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [file]);

  // Analyze the PDF once per file to determine page count and image content share.
  // The image share drives the fallback estimate; page count feeds the file summary.
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
        setPageCount(analysis.pages);
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

  // Faithful live preview: compress the WHOLE document at the current preset
  // (debounced, token-guarded, size-gated), cache the result, render page 1.
  useEffect(() => {
    if (
      !file ||
      status !== "idle" ||
      !shouldPreviewCompress(file.size, uploadLimitFor("pdf-compress"))
    ) {
      livePreviewTokenRef.current++;
      setLivePreviewLoading(false);
      if (file && status === "idle") setLiveResult(null); // gated-off: no real size
      return;
    }
    const token = ++livePreviewTokenRef.current;
    setLivePreviewLoading(true);
    const timer = setTimeout(async () => {
      let createdUrl: string | null = null;
      let committed = false;
      try {
        let result = previewCacheRef.current.get(preset);
        if (!result) {
          const ab = await file.arrayBuffer();
          result = await compressPdfFromBytes({ bytes: new Uint8Array(ab), preset });
          if (token !== livePreviewTokenRef.current) return;
          previewCacheRef.current.set(preset, result);
        }
        setLiveResult(result);
        const blob = await renderPdfFirstPage(result.data.slice(), PREVIEW_WIDTH, PREVIEW_MAX_SCALE);
        if (token !== livePreviewTokenRef.current) return;
        createdUrl = URL.createObjectURL(blob);
        if (token !== livePreviewTokenRef.current) return;
        setLivePreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return createdUrl;
        });
        committed = true;
      } catch {
        // Corrupt/failed compress → keep the original preview, no real size.
        if (token === livePreviewTokenRef.current) setLiveResult(null);
      } finally {
        if (createdUrl && !committed) URL.revokeObjectURL(createdUrl);
        setLivePreviewLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [file, preset, status]);

  // Revoke the live preview URL on unmount only.
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
  }, [retry]);

  const hasFile = !!file;
  const busy = status === "processing";
  const isDone = status === "done" && !!result;

  const overLimit = !!file && file.size > uploadLimitFor("pdf-compress");

  const fileInfo = file
    ? template(labels.fileInfoTemplate, {
        name: file.name,
        size: formatBytes(file.size),
      }) +
      (pageCount != null
        ? ` · ${template(labels.pageCountTemplate, { count: String(pageCount) })}`
        : "")
    : "";

  const headerMeta = overLimit ? (
    <span
      className="shrink-0 whitespace-nowrap font-body text-[11px]"
      style={{ color: "var(--ink-soft)" }}
      title={labels.fileUpload.largeFileWarning}
    >
      · {labels.oversizeBadge}
    </span>
  ) : undefined;

  // Unified compressed candidate: authoritative result in done state, live preview otherwise.
  const compressedCandidate = isDone ? compressedUrl : livePreviewUrl;

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
      meta={headerMeta}
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
    <div className={inline ? "space-y-4" : "space-y-4 px-6 pb-3"}>
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
        <div
          className="relative flex flex-col gap-3"
          style={{ height: "var(--tray-h)" }}
        >
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 md:grid-cols-2">
            {/* LEFT: preview frame — always shows the compressed page, click to zoom */}
            <div className="flex h-full flex-col">
              <ComparePreview
                originalUrl={originalUrl}
                compressedUrl={compressedCandidate}
                loading={livePreviewLoading && status === "idle"}
                zoomAria={labels.zoomAria}
              />
            </div>

            {/* RIGHT: controls / result / status — 1px panel divider (canon) */}
            <div
              className="flex h-full min-h-0 flex-col md:border-l md:pl-5"
              style={{ borderColor: "var(--border)" }}
            >
              {isDone && result ? (
                <PdfCompressResult
                  originalSize={result.originalSize}
                  compressedSize={result.compressedSize}
                  onDownload={download}
                  labels={labels}
                />
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
                      actualCompressedSize={liveResult?.compressedSize ?? null}
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
        </div>
      )}
    </div>
  );

  if (inline)
    return (
      <>
        <div className="mb-2 border-b pb-1" style={{ borderColor: "var(--border)" }}>
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
      <div className="mb-2 border-b px-6 pb-1 pt-3" style={{ borderColor: "var(--border)" }}>
        {header}
      </div>
      {body}
    </div>
  );
}
