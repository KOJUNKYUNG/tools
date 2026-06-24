"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PlusIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/common/FileUpload";
import { OversizeNotice } from "@/components/common/OversizeNotice";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { PageItemCard } from "@/components/pdf-editor/PageItemCard";
import { buildPageItems, deriveBaseName } from "@/components/pdf-editor/buildPageItems";
import { clearThumbnailCache } from "@/components/pdf-editor/thumbnailCache";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { totalSizeWarnFor, uploadLimitFor } from "@/lib/constants";
import { getErrorMessage } from "@/lib/errors";
import { normalizeImageFiles } from "@/lib/image/heic";
import {
  assembleSections,
  type ImageLayout,
} from "@/lib/pdf/assembleSections";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { type PageItem, type Rotation } from "@/lib/pdf/pageItem";
import { ImageToPdfResult } from "./ImageToPdfResult";
import { ImageToPdfTopStrip } from "./ImageToPdfTopStrip";
import { PageSizeSelector, type CustomSize, type PageSizeMode } from "./PageSizeSelector";
import type { ImageToPdfLabels } from "./labels";

const ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
};
const ACCEPT_ATTR = "image/png,image/jpeg,image/heic,image/heif,.heic,.heif";

const NEUTRAL_TINT = { ring: "transparent" } as const;

/** Read an image file's natural pixel dimensions. Returns null if it can't be
 *  decoded (used to seed the custom page-size default). */
async function readImagePixelSize(
  file: File,
): Promise<{ w: number; h: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { w: bitmap.width, h: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

export interface ImageToPdfResultData {
  bytes: Uint8Array;
  name: string;
  pageCount: number;
}

interface SortableCellProps {
  item: PageItem;
  pageNumber: number;
  bytes: Uint8Array | undefined;
  onRotate: (id: string) => void;
  onDelete: (id: string) => void;
  rotateAria: string;
  deleteAria: string;
  frameBg: string;
  pageAspect: number | null;
}

function SortableCell({
  item,
  pageNumber,
  bytes,
  onRotate,
  onDelete,
  rotateAria,
  deleteAria,
  frameBg,
  pageAspect,
}: SortableCellProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      className="flex items-stretch"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      <PageItemCard
        item={item}
        pageNumber={pageNumber}
        bytes={bytes}
        tint={NEUTRAL_TINT}
        onRotate={onRotate}
        onDelete={onDelete}
        rotateAria={rotateAria}
        deleteAria={deleteAria}
        frameBg={frameBg}
        pageAspect={pageAspect}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
      {/* No divider — image-to-pdf always produces one PDF. Keep the column gutter. */}
      <div className="w-[18px] shrink-0" aria-hidden="true" />
    </div>
  );
}

interface ImageToPdfProps {
  labels: ImageToPdfLabels;
  /** Locale for cross-tool handoff navigation (matches ImageResizeTool). */
  lang: string;
  inline?: boolean;
}

export function ImageToPdf({ labels, lang, inline = false }: ImageToPdfProps) {
  const router = useRouter();

  const [items, setItems] = useState<PageItem[]>([]);
  const [sourceBytesById, setSourceBytesById] = useState<Map<string, Uint8Array>>(
    new Map(),
  );
  const [loadingPages, setLoadingPages] = useState(false);
  const [sizeMode, setSizeMode] = useState<PageSizeMode>("fit");
  const [custom, setCustom] = useState<CustomSize>({ w: "595", h: "842" });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingModeRef = useRef<"replace" | "append">("append");

  const imageLayout = useMemo<ImageLayout>(() => {
    if (sizeMode === "a4") return { mode: "fixed", widthPt: 595, heightPt: 842 };
    if (sizeMode === "custom") {
      // Clamp to PDF's max page dimension (14400 pt ≈ 200in) so an absurd value
      // can't produce a giant page / OOM.
      const MAX_PT = 14400;
      const w = Math.min(MAX_PT, Math.max(1, Math.round(Number(custom.w) || 0)));
      const h = Math.min(MAX_PT, Math.max(1, Math.round(Number(custom.h) || 0)));
      return { mode: "fixed", widthPt: w, heightPt: h };
    }
    return { mode: "native" };
  }, [sizeMode, custom]);

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
  } = useToolProcessor<ImageToPdfResultData>({
    processor: async (_files, onProgress) => {
      const live = items.filter((p) => !p.deleted);
      if (live.length === 0) throw new Error("변환할 이미지가 없습니다.");
      const [bytes] = await assembleSections(
        { sections: [live], sourceBytesById, imageLayout },
        onProgress,
      );
      const name = `${deriveBaseName(items[0]?.sourceFileName)}.pdf`;
      return { bytes, name, pageCount: live.length };
    },
    onDownload: (res) => downloadBlob(res.bytes, res.name, "application/pdf"),
  });

  useEffect(() => () => clearThumbnailCache(), []);

  const ingest = useCallback(
    async (incoming: File[], mode: "replace" | "append") => {
      // Normalize HEIC/HEIF → JPEG before any further processing.
      setLoadingPages(true);
      let normalized: File[];
      try {
        normalized = await normalizeImageFiles(incoming);
      } catch (err) {
        toast.error(
          getErrorMessage(err, { fallbackMessage: "HEIC 파일을 변환할 수 없습니다." }).message,
        );
        setLoadingPages(false);
        return;
      }

      // Images only — drop anything that isn't an accepted image.
      const images = normalized.filter((f) => f.type === "image/png" || f.type === "image/jpeg");
      for (const f of normalized) {
        if (!(f.type === "image/png" || f.type === "image/jpeg")) {
          toast.error(`${f.name}: 이미지(JPG/PNG)만 추가할 수 있습니다.`);
        }
      }
      const accepted = images.filter((f) => f.size <= uploadLimitFor("image-to-pdf"));
      for (const f of images) {
        if (f.size > uploadLimitFor("image-to-pdf")) {
          toast.error(
            `${f.name}: 파일 크기가 ${formatBytes(uploadLimitFor("image-to-pdf"))}를 초과합니다.`,
          );
        }
      }
      if (accepted.length === 0) {
        setLoadingPages(false);
        return;
      }

      try {
        const built = await buildPageItems(accepted);
        if (built.items.length === 0) return;
        if (mode === "replace") {
          clearThumbnailCache();
          setItems(built.items);
          setSourceBytesById(built.sourceBytesById);
          setFiles(accepted);
          // Seed the custom page size with the first image's pixel dimensions, so
          // "사용자 지정" starts from a meaningful basis (the user's own image).
          const size = await readImagePixelSize(accepted[0]);
          if (size) setCustom({ w: String(size.w), h: String(size.h) });
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);
      return next;
    });
  }, []);

  const hasFiles = items.length > 0;
  const busy = status === "processing";

  const [oversizeDismissed, setOversizeDismissed] = useState(false);
  const totalBytes = useMemo(
    () => files.reduce((sum, f) => sum + f.size, 0),
    [files],
  );
  const showOversize =
    totalBytes > totalSizeWarnFor("image-to-pdf") && !oversizeDismissed;

  // White page-rect aspect (w/h) shown inside each editor card. null = fit-image
  // (no fixed page → image fills the card directly).
  const editorPageAspect =
    sizeMode === "a4"
      ? 595 / 842
      : sizeMode === "custom"
        ? Math.max(1, Number(custom.w) || 0) / Math.max(1, Number(custom.h) || 0)
        : null;

  const filesSummary =
    files.length <= 1
      ? template(labels.filesOneTemplate, { name: files[0]?.name ?? "" })
      : template(labels.filesManyTemplate, {
          name: files[0].name,
          rest: files.length - 1,
        });

  const editor = (
    <div className="flex flex-col gap-3" style={{ height: "var(--tray-h)" }}>
      <ImageToPdfTopStrip
        filesSummary={filesSummary}
        onReupload={handleReuploadPick}
        reuploadLabel={labels.reupload}
        onConvert={run}
        convertLabel={template(labels.convertTemplate, { n: items.length })}
        convertDisabled={!hasFiles}
        busy={busy}
      />

      <PageSizeSelector
        mode={sizeMode}
        onModeChange={setSizeMode}
        custom={custom}
        onCustomChange={setCustom}
        labels={{
          sizeLabel: labels.sizeLabel,
          sizeFit: labels.sizeFit,
          sizeA4: labels.sizeA4,
          sizeCustom: labels.sizeCustom,
          customWidth: labels.customWidth,
          customHeight: labels.customHeight,
        }}
      />

      <div
        className="ob-scroll min-h-0 flex-1 overflow-y-auto rounded-2xl p-3"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-md), inset 0 1px 0 rgba(255,255,255,0.8)",
        }}
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((p) => p.id)} strategy={rectSortingStrategy}>
            <div className="flex flex-wrap justify-center gap-0">
              {items.map((item, i) => (
                <SortableCell
                  key={item.id}
                  item={item}
                  pageNumber={i + 1}
                  bytes={sourceBytesById.get(item.sourceFileId)}
                  onRotate={handleRotate}
                  onDelete={handleDelete}
                  rotateAria={labels.rotateAria}
                  deleteAria={labels.deleteAria}
                  frameBg="var(--surface-2)"
                  pageAspect={editorPageAspect}
                />
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
          </SortableContext>
        </DndContext>
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
          accept={ACCEPT}
          multiple
          hideFileList
          maxSize={uploadLimitFor("image-to-pdf")}
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
        <ImageToPdfResult
          result={result}
          labels={labels}
          onDownload={download}
          onAgain={retry}
          lang={lang}
          router={router}
        />
      ) : (
        <ProcessingStatus
          status={status}
          progress={progress}
          errorMessage={errorMessage}
          onRetry={retry}
          onDownload={download}
        />
      )}

      {loadingPages && (
        <div className="flex items-center gap-2 text-sm text-[color:var(--ink)]">
          <span className="inline-block size-4 animate-spin rounded-full border-2 border-[color:var(--emphasis)] border-t-transparent" />
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
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-lg)",
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
      <div className="flex items-start gap-3 border-b px-6 pb-3 pt-3" style={{ borderColor: "var(--border)" }}>
        <div className="min-w-0 flex-1">
          <div className="font-ko text-[16px] font-medium leading-[1.2] tracking-[0.005em]" style={{ color: "var(--headline)" }}>
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
