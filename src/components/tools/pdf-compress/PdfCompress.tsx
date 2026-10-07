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
import { selectSizeDisplay } from "@/lib/pdf/compressEstimate";
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

const LIVE_PREVIEW_LIMIT = uploadLimitFor("pdf-compress");

/** Outcome of the live whole-doc compress, tagged so it is never shown for another file or preset. */
interface LiveOutcome {
  file: File;
  preset: CompressionPreset;
  /** null = the live compress failed. */
  result: CompressPdfResult | null;
}

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
  const [live, setLive] = useState<LiveOutcome | null>(null);
  const livePreviewTokenRef = useRef(0);
  // Precompute cache: preset -> whole-doc result for the CURRENT file. Cleared on file change.
  const previewCacheRef = useRef<Map<CompressionPreset, CompressPdfResult>>(new Map());

  // Page count captured by the upload check, tagged with its file.
  const [fileMeta, setFileMeta] = useState<{ file: File; pages: number } | null>(null);
  const acceptTokenRef = useRef(0);

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

  // Every entry path (drop, re-upload, cross-tool handoff) goes through here.
  // The compressor cannot read encrypted PDFs, so they are refused up front —
  // like an oversize file elsewhere — instead of failing after "Compress".
  // The same analyze() pass yields the page count for the file summary.
  const acceptFiles = useCallback(
    async (newFiles: File[]) => {
      const picked = newFiles[0];
      if (!picked) return;
      const token = ++acceptTokenRef.current;
      let pages: number | null = null;
      try {
        const analysis = await analyzePdf(picked);
        if (token !== acceptTokenRef.current) return;
        if (analysis.isEncrypted) {
          toast.error(labels.errorEncrypted);
          return;
        }
        pages = analysis.pages;
      } catch {
        if (token !== acceptTokenRef.current) return;
        // Unanalyzable: accept anyway; compression reports its own error.
      }
      retry();
      setFiles([picked]);
      if (pages != null) setFileMeta({ file: picked, pages });
    },
    [labels.errorEncrypted, retry, setFiles],
  );

  // Consume cross-tool handoff (e.g. from image-to-pdf). Once on mount.
  useEffect(() => {
    const staged = consumeStagedFiles();
    if (staged && staged.files.length > 0) void acceptFiles(staged.files);
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

  // Drop the previous file's cached compressions and preview when the file changes.
  useEffect(() => {
    previewCacheRef.current = new Map();
    setLive(null); // release the previous file's result bytes
    setLivePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [file]);

  // Faithful live preview: compress the WHOLE document at the current preset
  // (debounced, token-guarded, size-gated), cache the result, render page 1.
  useEffect(() => {
    if (!file || status !== "idle" || !shouldPreviewCompress(file.size, LIVE_PREVIEW_LIMIT)) {
      livePreviewTokenRef.current++;
      setLivePreviewLoading(false);
      return;
    }
    const token = ++livePreviewTokenRef.current;
    setLivePreviewLoading(true);
    // Debounce only real compress work; switching back to an already-computed
    // preset is applied immediately.
    const delay = previewCacheRef.current.has(preset) ? 0 : 400;
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
        setLive({ file, preset, result });
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
        // Failed compress → keep the original preview; the size slot defers.
        if (token === livePreviewTokenRef.current) setLive({ file, preset, result: null });
      } finally {
        if (createdUrl && !committed) URL.revokeObjectURL(createdUrl);
        setLivePreviewLoading(false);
      }
    }, delay);
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
      if (picked.length > 0) void acceptFiles(picked);
      e.target.value = "";
    },
    [acceptFiles, status],
  );

  const handleAgain = useCallback(() => {
    retry();
  }, [retry]);

  const hasFile = !!file;
  const busy = status === "processing";
  const isDone = status === "done" && !!result;

  const overLimit = !!file && file.size > LIVE_PREVIEW_LIMIT;
  const livePreview = !!file && shouldPreviewCompress(file.size, LIVE_PREVIEW_LIMIT);
  const liveNow = live && live.file === file && live.preset === preset ? live : null;
  const sizeDisplay = selectSizeDisplay({
    actualCompressedSize: liveNow?.result?.compressedSize ?? null,
    livePreview,
    liveFailed: liveNow !== null && liveNow.result === null,
  });
  const estimateNotes = [
    ...(livePreview
      ? []
      : [template(labels.previewDeferredHint, { size: formatBytes(LIVE_PREVIEW_LIMIT) })]),
    ...(liveNow?.result?.imageReencodeSkipped ? [labels.imageReencodeSkippedNote] : []),
  ];

  const pageCount = fileMeta && fileMeta.file === file ? fileMeta.pages : null;
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
          onFiles={(picked) => void acceptFiles(picked)}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={labels.fileUpload}
        />
      ) : (
        <div className="flex flex-col gap-3" style={{ height: "var(--tray-h)" }}>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 md:grid-cols-2">
            {/* LEFT: preview frame — compressed page, click to zoom, hold to compare */}
            <div className="flex h-full flex-col">
              <ComparePreview
                originalUrl={originalUrl}
                compressedUrl={compressedCandidate}
                loading={livePreviewLoading && status === "idle"}
                zoomAria={labels.zoomAria}
                compareLabel={labels.compareHoldLabel}
                compareHint={labels.compareHoldHint}
                originalBadge={labels.originalBadge}
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
                  note={result.imageReencodeSkipped ? labels.imageReencodeSkippedNote : undefined}
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
                      display={sizeDisplay}
                      labels={labels}
                      notes={estimateNotes}
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
