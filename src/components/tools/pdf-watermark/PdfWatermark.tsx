"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StampIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { PageRangeSelector } from "@/components/common/PageRangeSelector";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { FILE_SIZE_LIMIT } from "@/lib/constants";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import {
  analyzePdfForOverlay,
  applyOverlay,
  type ApplyResult,
  type OverlayOptions,
  type PdfOverlayAnalysis,
} from "@/lib/pdf/applyPdfOverlay";
import { deriveOutputName, type WatermarkMode } from "@/lib/pdf/watermarkNaming";
import { PdfWatermarkModeToggle } from "./PdfWatermarkModeToggle";
import { PageNumberControls, type PageNumberState } from "./PageNumberControls";
import { WatermarkControls, type WatermarkState } from "./WatermarkControls";
import { PdfWatermarkPreview } from "./PdfWatermarkPreview";
import { PdfWatermarkResult } from "./PdfWatermarkResult";
import type { PdfWatermarkLabels } from "./labels";

const PDF_ACCEPT = { "application/pdf": [".pdf"] };
const PDF_MIME = "application/pdf";

const DEFAULT_PAGE: PageNumberState = {
  format: "plain",
  start: 1,
  grid: "bottom-center",
  fontPx: 12,
  color: "#444444",
  margin: 24,
};

const DEFAULT_WM: WatermarkState = {
  source: "text",
  text: "",
  fontPx: 48,
  color: "#888888",
  logo: null,
  logoScale: 0.4,
  opacity: 0.3,
  angle: 45,
  tile: false,
  grid: "center",
  margin: 24,
};

interface PdfWatermarkProps {
  labels: PdfWatermarkLabels;
  inline?: boolean;
}

export function PdfWatermark({ labels, inline = false }: PdfWatermarkProps) {
  const [mode, setMode] = useState<WatermarkMode>("number");
  const [pageOpts, setPageOpts] = useState<PageNumberState>(DEFAULT_PAGE);
  const [wmOpts, setWmOpts] = useState<WatermarkState>(DEFAULT_WM);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PdfOverlayAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const reuploadInputRef = useRef<HTMLInputElement | null>(null);
  const filesRef = useRef<File[]>([]);
  const modeRef = useRef<WatermarkMode>(mode);

  const buildOptions = useCallback((): OverlayOptions => {
    const pages = [...selectedPages].sort((a, b) => a - b);
    if (mode === "number") {
      return { mode: "number", ...pageOpts, suffix: labels.pageUnitSuffix, pages };
    }
    return { mode: "watermark", ...wmOpts, pages };
  }, [mode, pageOpts, wmOpts, selectedPages, labels.pageUnitSuffix]);

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
  } = useToolProcessor<ApplyResult>({
    processor: (processorFiles, onProgress) =>
      applyOverlay({ file: processorFiles[0], options: buildOptions(), onProgress }),
    onDownload: (res) =>
      downloadBlob(
        res.data,
        deriveOutputName(filesRef.current[0]?.name ?? "", modeRef.current),
        PDF_MIME,
      ),
    errorOptions: {
      memoryHint: labels.errorMemory,
      corruptOutputHint: labels.errorCorrupt,
    },
  });

  useEffect(() => {
    filesRef.current = files;
    modeRef.current = mode;
  });

  const file = files[0];

  useEffect(() => {
    if (!file) {
      setAnalysis(null);
      setSelectedPages(new Set());
      return;
    }
    let cancelled = false;
    setAnalyzing(true);
    setAnalysis(null);
    (async () => {
      try {
        const res = await analyzePdfForOverlay(file);
        if (cancelled) return;
        setAnalysis(res);
        // Default to applying to every page; the user can narrow it.
        const all = new Set<number>();
        for (let i = 1; i <= res.numPages; i++) all.add(i);
        setSelectedPages(all);
      } catch {
        if (!cancelled) setAnalysis(null);
      } finally {
        if (!cancelled) setAnalyzing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const handleFilesChange = useCallback(
    (newFiles: File[]) => {
      retry();
      setFiles(newFiles.slice(0, 1));
    },
    [retry, setFiles],
  );

  const handleReupload = useCallback(() => reuploadInputRef.current?.click(), []);

  const handleHiddenInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (status === "processing") {
        e.target.value = "";
        return;
      }
      const picked = e.target.files ? Array.from(e.target.files) : [];
      // The dropzone enforces maxSize, but this hidden re-upload input bypasses
      // it — guard here so an oversized file can't slip in via "다시 업로드".
      const tooLarge = picked.find((f) => f.size > FILE_SIZE_LIMIT.user);
      if (tooLarge) {
        toast.error(
          template(labels.fileUpload.tooLargeTemplate, {
            name: tooLarge.name,
            size: formatBytes(FILE_SIZE_LIMIT.user),
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

  const onReset = useCallback(() => {
    handleFilesChange([]);
    setMode("number");
    setPageOpts(DEFAULT_PAGE);
    setWmOpts(DEFAULT_WM);
    setLogoName(null);
    setSelectedPages(new Set());
  }, [handleFilesChange]);

  const handleAgain = useCallback(() => retry(), [retry]);

  const onPickLogo = useCallback(async (logoFile: File | null) => {
    if (!logoFile) {
      setWmOpts((p) => ({ ...p, logo: null }));
      setLogoName(null);
      return;
    }
    const bytes = new Uint8Array(await logoFile.arrayBuffer());
    const kind = logoFile.type === "image/png" ? "png" : "jpg";
    setWmOpts((p) => ({ ...p, logo: { bytes, kind } }));
    setLogoName(logoFile.name);
  }, []);

  const patchPage = useCallback(
    (patch: Partial<PageNumberState>) => setPageOpts((p) => ({ ...p, ...patch })),
    [],
  );
  const patchWm = useCallback(
    (patch: Partial<WatermarkState>) => setWmOpts((p) => ({ ...p, ...patch })),
    [],
  );

  const hasFile = !!file;
  const busy = status === "processing";
  const isDone = status === "done" && !!result;

  const fileInfo = file
    ? template(labels.fileInfoTemplate, { name: file.name, size: formatBytes(file.size) })
    : "";

  const handleApplyClick = useCallback(() => {
    if (!file) {
      toast.error(labels.uploadPrompt);
      return;
    }
    // Pre-validate so the worker never throws hardcoded-Korean errors at EN users.
    if (mode === "watermark") {
      if (wmOpts.source === "text" && !wmOpts.text.trim()) {
        toast.error(labels.needText);
        return;
      }
      if (wmOpts.source === "image" && !wmOpts.logo) {
        toast.error(labels.needLogo);
        return;
      }
    }
    run();
  }, [
    file,
    run,
    mode,
    wmOpts.source,
    wmOpts.text,
    wmOpts.logo,
    labels.uploadPrompt,
    labels.needText,
    labels.needLogo,
  ]);

  const body = (
    <div className={inline ? "space-y-4" : "space-y-4 px-6 py-3"}>
      <input
        ref={reuploadInputRef}
        type="file"
        accept=".pdf"
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
          maxSize={FILE_SIZE_LIMIT.user}
          onFiles={handleFilesChange}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={{ ...labels.fileUpload, maxSize: labels.uploadMaxSize }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2" style={{ height: "52vh" }}>
          {/* LEFT: file info + reupload → live preview */}
          <div className="flex h-full min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-baseline gap-1.5">
                <span
                  className="min-w-0 truncate font-body text-[12px]"
                  style={{ color: "var(--ink)" }}
                  title={fileInfo}
                >
                  {fileInfo}
                </span>
                {analysis && (
                  <span className="shrink-0 font-body text-[12px]" style={{ color: "var(--ink-soft)" }}>
                    · {template(labels.pageCountTemplate, { n: analysis.numPages })}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleReupload}
                disabled={busy}
                className="shrink-0 rounded-[5px] border px-2.5 py-1.5 font-body text-[11px] transition-colors hover:border-[color:var(--emphasis)] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--ink-strong)" }}
              >
                {labels.reupload}
              </button>
            </div>
            <PdfWatermarkPreview
              file={file}
              mode={mode}
              pageOpts={pageOpts}
              wmOpts={wmOpts}
              analysis={analysis}
              analyzing={analyzing}
              labels={labels}
            />
          </div>

          {/* RIGHT: controls / result / status */}
          {isDone && result ? (
            <div className="self-start">
              <PdfWatermarkResult
                appliedPages={result.appliedPages}
                pageCount={result.pageCount}
                outputSize={result.data.length}
                onDownload={download}
                onAgain={handleAgain}
                labels={labels}
              />
            </div>
          ) : status === "idle" ? (
            // Mode toggle + apply stay pinned; only the controls scroll, so the
            // taller watermark controls never clip the top of the card.
            <div className="flex h-full min-h-0 flex-col gap-3">
              <PdfWatermarkModeToggle
                value={mode}
                onChange={setMode}
                labels={labels}
                disabled={busy}
              />
              <button
                type="button"
                onClick={handleApplyClick}
                className="btn-primary inline-flex h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-[9px] px-4 font-body text-[13px] font-semibold"
              >
                {labels.apply}
              </button>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {mode === "number" ? (
                  <PageNumberControls
                    value={pageOpts}
                    onChange={patchPage}
                    labels={labels}
                    disabled={busy}
                    totalPages={analysis?.numPages ?? 0}
                    selectedPages={selectedPages}
                    onSelectedChange={setSelectedPages}
                  />
                ) : (
                  <>
                    <WatermarkControls
                      value={wmOpts}
                      onChange={patchWm}
                      labels={labels}
                      logoName={logoName}
                      onPickLogo={onPickLogo}
                      disabled={busy}
                    />
                    {analysis && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="font-mono text-[11px] font-medium uppercase tracking-[0.08em]"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {labels.rangeLabel}
                          </span>
                          <span className="font-body text-[11px] tabular-nums" style={{ color: "var(--ink)" }}>
                            {template(labels.rangeCountTemplate, { n: selectedPages.size })}
                          </span>
                        </div>
                        <PageRangeSelector
                          totalPages={analysis.numPages}
                          selected={selectedPages}
                          onChange={setSelectedPages}
                          inputPlaceholder={labels.rangePlaceholder}
                          selectAllLabel={labels.rangeSelectAll}
                          clearLabel={labels.rangeClear}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
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
          "0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 48px -16px rgba(0,0,0,0.28), 0 8px 20px -6px rgba(0,0,0,0.16)",
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
      <div className="flex items-start gap-3 border-b px-6 pb-3 pt-3" style={{ borderColor: "var(--border)" }}>
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-[5px]"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink-strong)" }}
        >
          <StampIcon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="font-ko text-[16px] font-medium leading-[1.2] tracking-[0.005em]"
            style={{ color: "var(--headline)" }}
          >
            {labels.title}
          </div>
          <div className="mt-1 font-body text-[12px] leading-[1.45]" style={{ color: "var(--ink)" }}>
            {labels.description}
          </div>
        </div>
      </div>
      {body}
    </div>
  );
}
