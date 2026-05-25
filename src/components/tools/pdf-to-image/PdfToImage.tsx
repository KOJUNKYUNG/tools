"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileImage, PlusIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { PageItemCard, type SectionTint } from "@/components/pdf-editor/PageItemCard";
import { buildPageItems, deriveBaseName } from "@/components/pdf-editor/buildPageItems";
import { clearThumbnailCache } from "@/components/pdf-editor/thumbnailCache";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { stageFiles } from "@/lib/common/toolHandoff";
import { FILE_SIZE_LIMIT } from "@/lib/constants";
import { getErrorMessage } from "@/lib/errors";
import { buildConversionJobs } from "@/lib/pdf/buildConversionJobs";
import { downloadBlobObject } from "@/lib/pdf/downloadBlob";
import { deriveZipName } from "@/lib/pdf/pdfToImageNaming";
import {
  pdfToImages,
  type ConvertedImage,
  type DpiOption,
  type OutputFormat,
} from "@/lib/pdf/pdfToImage";
import { type PageItem, type Rotation } from "@/lib/pdf/pageItem";
import { PdfToImageControls } from "./PdfToImageControls";
import { PdfToImageResult } from "./PdfToImageResult";
import { PdfToImageTopStrip } from "./PdfToImageTopStrip";
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
  } = useToolProcessor<ConvertedImage[]>({
    processor: async (_files, onProgress) => {
      const jobs = buildConversionJobs(items);
      if (jobs.length === 0) throw new Error("변환할 페이지가 없습니다.");
      return pdfToImages({ jobs, sourceBytesById, format, dpi, onProgress });
    },
    onDownload: async (images) => {
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
      const accepted = pdfs.filter((f) => f.size <= FILE_SIZE_LIMIT.guest);
      for (const f of pdfs) {
        if (f.size > FILE_SIZE_LIMIT.guest) {
          toast.error(
            `${f.name}: 파일 크기가 ${formatBytes(FILE_SIZE_LIMIT.guest)}를 초과합니다.`,
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
          setFiles([...files, ...accepted]);
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

  const handleReset = useCallback(() => {
    retry();
    clearThumbnailCache();
    setItems([]);
    setSourceBytesById(new Map());
    setFiles([]);
  }, [retry, setFiles]);

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
    if (!result) return;
    const imageFiles = result.map(
      (img) => new File([img.blob], img.name, { type: format }),
    );
    stageFiles(imageFiles, "pdf-to-image");
    router.push(`/${lang}/tools/image-compress`);
  }, [result, format, router, lang]);

  const hasFiles = items.length > 0;
  const busy = status === "processing";
  const liveCount = items.filter((p) => !p.deleted).length;

  const filesSummary =
    files.length <= 1
      ? template(labels.filesOneTemplate, { name: files[0]?.name ?? "" })
      : template(labels.filesManyTemplate, {
          name: files[0].name,
          rest: files.length - 1,
        });

  const editor = (
    <div className="flex flex-col gap-3" style={{ height: "52vh" }}>
      <PdfToImageTopStrip
        filesSummary={filesSummary}
        onReupload={handleReuploadPick}
        reuploadLabel={labels.reupload}
        onConvert={run}
        convertLabel={template(labels.convertTemplate, { n: liveCount })}
        convertDisabled={liveCount === 0}
        busy={busy}
      />

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
              className="my-[9px] flex h-[204px] w-[150px] items-center justify-center rounded-[5px] border-[1.5px] border-dashed text-[color:var(--ink-soft)] transition-colors hover:border-[color:var(--accent-electric)] hover:text-[color:var(--accent-electric)]"
              style={{
                borderColor: "var(--hairline)",
                background: "var(--bg-soft, var(--silver-100))",
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

  const body = (
    <div className={inline ? "space-y-4" : "space-y-4 px-6 py-3"}>
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
          onFiles={handleUpload}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={{ maxSize: labels.uploadMaxSize }}
        />
      ) : status === "idle" ? (
        editor
      ) : status === "done" && result ? (
        <PdfToImageResult
          images={result}
          labels={labels}
          format={format}
          onDownloadAll={download}
          onDownloadOne={handleDownloadOne}
          onCompress={handleCompress}
          onAgain={retry}
        />
      ) : (
        <div style={{ height: "52vh" }}>
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
          <span className="inline-block size-4 animate-spin rounded-full border-2 border-[color:var(--accent-electric)] border-t-transparent" />
          {labels.processing}
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
        onClick={handleReset}
        disabled={busy}
        aria-label={labels.reupload}
        title={labels.reupload}
        className="absolute right-6 top-4 z-10 rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
          <FileImage size={18} />
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
