"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import { FileUpload } from "@/components/common/FileUpload";
import { OversizeNotice } from "@/components/common/OversizeNotice";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { ToolHeader } from "@/components/common/ToolHeader";
import { PageItemCard, type SectionTint } from "@/components/pdf-editor/PageItemCard";
import { buildPageItems, deriveBaseName } from "@/components/pdf-editor/buildPageItems";
import { clearThumbnailCache } from "@/components/pdf-editor/thumbnailCache";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { stageFiles } from "@/lib/common/toolHandoff";
import {
  PDF_TO_IMAGE_BATCH_BYTES,
  totalSizeWarnFor,
  uploadLimitFor,
} from "@/lib/constants";
import { getErrorMessage } from "@/lib/errors";
import { buildConversionJobs } from "@/lib/pdf/buildConversionJobs";
import { downloadBlobObject } from "@/lib/pdf/downloadBlob";
import { deriveBatchZipName, deriveZipName } from "@/lib/pdf/pdfToImageNaming";
import {
  pdfToImages,
  type ConvertedImage,
  type DpiOption,
  type OutputFormat,
  type PdfToImageOutcome,
} from "@/lib/pdf/pdfToImage";
import { type PageItem, type Rotation } from "@/lib/pdf/pageItem";
import { PdfToImageControls } from "./PdfToImageControls";
import { PdfToImageResult } from "./PdfToImageResult";
import { PdfToImageStreamedResult } from "./PdfToImageStreamedResult";
import type { PdfToImageLabels } from "./labels";

const PDF_ACCEPT = { "application/pdf": [".pdf"] };
const ACCEPT_ATTR = "application/pdf";
const NEUTRAL_TINT: SectionTint = { ring: "transparent" };

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

interface PdfToImageProps {
  labels: PdfToImageLabels;
  /** Locale for cross-tool handoff navigation. */
  lang: string;
  inline?: boolean;
}

export function PdfToImage({ labels, lang, inline = false }: PdfToImageProps) {
  const router = useRouter();

  const [items, setItems] = useState<PageItem[]>([]);
  const [sourceBytesById, setSourceBytesById] = useState<Map<string, Uint8Array>>(
    new Map(),
  );
  const [loadingPages, setLoadingPages] = useState(false);
  const [format, setFormat] = useState<OutputFormat>("image/jpeg");
  const [dpi, setDpi] = useState<DpiOption>(150);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingModeRef = useRef<"replace" | "append">("append");

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
  } = useToolProcessor<PdfToImageOutcome>({
    processor: async (_files, onProgress) => {
      const jobs = buildConversionJobs(items);
      if (jobs.length === 0) throw new Error("변환할 페이지가 없습니다.");
      const base = deriveBaseName(items[0]?.sourceFileName);
      return pdfToImages({
        jobs,
        sourceBytesById,
        format,
        dpi,
        batchByteTarget: PDF_TO_IMAGE_BATCH_BYTES,
        onBatch: async (batchImages, batchIndex) => {
          const zip = new JSZip();
          for (const img of batchImages) zip.file(img.name, img.blob);
          const zipBlob = await zip.generateAsync({
            type: "blob",
            compression: "STORE",
          });
          downloadBlobObject(zipBlob, deriveBatchZipName(base, batchIndex));
          toast.success(template(labels.batchSavedToast, { n: batchIndex }));
          // Space sequential downloads so the browser does not block them.
          await new Promise((resolve) => setTimeout(resolve, 300));
        },
        onProgress,
      });
    },
    onDownload: async (outcome) => {
      if (outcome.mode !== "preview") return;
      const images = outcome.images;
      if (images.length === 0) return;
      if (images.length === 1) {
        downloadBlobObject(images[0].blob, images[0].name);
        return;
      }
      const base = deriveBaseName(items[0]?.sourceFileName);
      const zip = new JSZip();
      for (const img of images) zip.file(img.name, img.blob);
      // Images are already compressed — STORE skips a pointless deflate pass and
      // lets JSZip stream to a Blob instead of building one giant Uint8Array.
      const zipBlob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      downloadBlobObject(zipBlob, deriveZipName(base));
    },
    errorOptions: {
      memoryHint:
        "브라우저 메모리가 부족합니다. DPI를 낮추거나 페이지가 적은 PDF를 사용해 주세요.",
    },
  });

  useEffect(() => () => clearThumbnailCache(), []);

  const ingest = useCallback(
    async (incoming: File[], mode: "replace" | "append") => {
      const pdfs = incoming.filter(isPdf);
      for (const f of incoming) {
        if (!isPdf(f)) toast.error(`${f.name}: PDF 파일만 추가할 수 있습니다.`);
      }
      const accepted = pdfs.filter((f) => f.size <= uploadLimitFor("pdf-to-image"));
      for (const f of pdfs) {
        if (f.size > uploadLimitFor("pdf-to-image")) {
          toast.error(
            `${f.name}: 파일 크기가 ${formatBytes(uploadLimitFor("pdf-to-image"))}를 초과합니다.`,
          );
        }
      }
      if (accepted.length === 0) return;

      setLoadingPages(true);
      try {
        const built = await buildPageItems(accepted);
        for (const n of built.failed) toast.error(`${n}: 열 수 없는 PDF입니다.`);
        if (built.items.length === 0) return;
        if (mode === "replace") {
          clearThumbnailCache();
          setItems(built.items);
          setSourceBytesById(built.sourceBytesById);
          setFiles(accepted);
        } else {
          setItems((prev) => [...prev, ...built.items]);
          setSourceBytesById((prev) => new Map([...prev, ...built.sourceBytesById]));
          setFiles((prev) => [...prev, ...accepted]);
        }
      } catch (err) {
        toast.error(
          getErrorMessage(err, { fallbackMessage: "파일을 읽을 수 없습니다." }).message,
        );
      } finally {
        setLoadingPages(false);
      }
    },
    [files, setFiles],
  );

  const handleUpload = useCallback(
    (newFiles: File[]) => {
      retry();
      void ingest(newFiles, "replace");
    },
    [retry, ingest],
  );

  const handleReuploadPick = useCallback(() => {
    pendingModeRef.current = "replace";
    retry();
    fileInputRef.current?.click();
  }, [retry]);

  const handleAddClick = useCallback(() => {
    pendingModeRef.current = "append";
    fileInputRef.current?.click();
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files ? Array.from(e.target.files) : [];
      if (picked.length > 0) void ingest(picked, pendingModeRef.current);
      e.target.value = "";
    },
    [ingest],
  );

  const handleRotate = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, rotation: (((p.rotation + 90) % 360) as Rotation) } : p,
      ),
    );
  }, []);

  const handleDelete = useCallback((id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleDownloadOne = useCallback((image: ConvertedImage) => {
    downloadBlobObject(image.blob, image.name);
  }, []);

  const handleCompress = useCallback(() => {
    if (!result || result.mode !== "preview") return;
    const imageFiles = result.images.map(
      (img) => new File([img.blob], img.name, { type: format }),
    );
    stageFiles(imageFiles, "pdf-to-image");
    router.push(`/${lang}/tools/image-compress`);
  }, [result, format, router, lang]);

  const hasFiles = items.length > 0;
  const busy = status === "processing";
  const liveCount = items.filter((p) => !p.deleted).length;

  const [oversizeDismissed, setOversizeDismissed] = useState(false);
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const showOversize =
    totalBytes > totalSizeWarnFor("pdf-to-image") && !oversizeDismissed;

  const filesSummary =
    files.length <= 1
      ? template(labels.filesOneTemplate, { name: files[0]?.name ?? "" })
      : template(labels.filesManyTemplate, {
          name: files[0].name,
          rest: files.length - 1,
        });

  const editor = (
    <div className="flex flex-col gap-3" style={{ height: "var(--tray-h)" }}>
      <PdfToImageControls
        format={format}
        dpi={dpi}
        onFormatChange={setFormat}
        onDpiChange={setDpi}
        labels={labels}
      />

      <div
        className="ob-scroll min-h-0 flex-1 overflow-y-auto rounded-2xl p-3"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-md), inset 0 1px 0 rgba(255,255,255,0.8)",
        }}
      >
        <div className="flex flex-wrap justify-center gap-0">
          {items.map((item, i) => (
            <div key={item.id} className="flex items-stretch">
              <PageItemCard
                item={item}
                pageNumber={i + 1}
                bytes={sourceBytesById.get(item.sourceFileId)}
                tint={NEUTRAL_TINT}
                onRotate={handleRotate}
                onDelete={handleDelete}
                rotateAria={labels.rotateAria}
                deleteAria={labels.deleteAria}
                draggable={false}
              />
              <div className="w-[18px] shrink-0" aria-hidden="true" />
            </div>
          ))}
          <div className="flex items-stretch">
            <button
              type="button"
              onClick={handleAddClick}
              aria-label={labels.addAria}
              title={labels.addAria}
              className="my-[9px] flex h-[204px] w-[150px] items-center justify-center rounded-[5px] border-[1.5px] border-dashed text-[color:var(--ink-soft)] transition-colors hover:border-[color:var(--emphasis)] hover:text-[color:var(--emphasis)]"
              style={{
                borderColor: "var(--hairline)",
                background: "var(--surface-2)",
              }}
            >
              <PlusIcon className="size-7" />
            </button>
            <div className="w-[18px] shrink-0" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );

  const header = (
    <ToolHeader
      title={labels.title}
      description={labels.description}
      hasFile={hasFiles}
      fileSummary={filesSummary}
      status={status}
      onReupload={handleReuploadPick}
      reuploadLabel={labels.reupload}
      busy={busy}
      executeLabel={template(labels.convertTemplate, { n: liveCount })}
      processingLabel={labels.processing}
      againLabel={labels.again}
      onExecute={run}
      onAgain={retry}
      executeDisabled={liveCount === 0}
    />
  );

  const body = (
    <div className={inline ? "space-y-4" : "space-y-4 px-6 pb-3"}>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        onChange={handleFileInput}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {!hasFiles ? (
        <FileUpload
          accept={PDF_ACCEPT}
          multiple
          hideFileList
          maxSize={uploadLimitFor("pdf-to-image")}
          onFiles={handleUpload}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={{ ...labels.fileUpload, maxSize: labels.uploadMaxSize }}
        />
      ) : status === "idle" ? (
        <>
          {showOversize && (
            <OversizeNotice
              totalBytes={totalBytes}
              warning={labels.fileUpload.oversizeWarning}
              dismissLabel={labels.fileUpload.dismiss}
              onDismiss={() => setOversizeDismissed(true)}
            />
          )}
          {editor}
        </>
      ) : status === "done" && result ? (
        result.mode === "preview" ? (
          <PdfToImageResult
            images={result.images}
            labels={labels}
            format={format}
            onDownloadAll={download}
            onDownloadOne={handleDownloadOne}
            onCompress={handleCompress}
          />
        ) : (
          <PdfToImageStreamedResult
            imageCount={result.imageCount}
            batchCount={result.batchCount}
            labels={labels}
          />
        )
      ) : (
        <div style={{ height: "var(--tray-h)" }}>
          <ProcessingStatus
            status={status}
            progress={progress}
            errorMessage={errorMessage}
            onRetry={retry}
            onDownload={download}
            labels={{ processing: labels.processing }}
          />
        </div>
      )}

      {loadingPages && (
        <div className="flex items-center gap-2 text-sm text-[color:var(--ink)]">
          <span className="inline-block size-4 animate-spin rounded-full border-2 border-[color:var(--emphasis)] border-t-transparent" />
          {labels.processing}
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
      <div
        className="mb-2 border-b px-6 pb-1 pt-3"
        style={{ borderColor: "var(--border)" }}
      >
        {header}
      </div>
      {body}
    </div>
  );
}
