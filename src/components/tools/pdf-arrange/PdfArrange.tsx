"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/common/FileUpload";
import { OversizeNotice } from "@/components/common/OversizeNotice";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { ToolHeader } from "@/components/common/ToolHeader";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { totalSizeWarnFor, uploadLimitFor } from "@/lib/constants";
import { getErrorMessage } from "@/lib/errors";
import { assembleSections, packageOutputs } from "@/lib/pdf/assembleSections";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import {
  type PageItem,
  type Rotation,
  buildOutputNames,
  countSections,
  splitIntoSections,
} from "@/lib/pdf/pageItem";
import { buildPageItems, deriveBaseName } from "@/components/pdf-editor/buildPageItems";
import { normalizeImageFiles } from "@/lib/image/heic";
import { Divider } from "./Divider";
import { PageItemCard, type SectionTint } from "@/components/pdf-editor/PageItemCard";
import {
  type ArrangeResult,
  type OutputEntry,
  PdfArrangeResult,
} from "./PdfArrangeResult";
import type { PdfArrangeLabels } from "./labels";
import { clearThumbnailCache } from "@/components/pdf-editor/thumbnailCache";

const ACCEPT = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
};
const ACCEPT_ATTR =
  "application/pdf,image/png,image/jpeg,image/heic,image/heif,.heic,.heif";

/** Per-section ring tints, cycled across sections — neutral light / mid / dark
 *  (no hue; section grouping reads via tone difference + the divider mark). */
const TINTS: SectionTint[] = [
  { ring: "oklch(0.55 0 0 / 0.16)" },
  { ring: "oklch(0.72 0 0 / 0.18)" },
  { ring: "oklch(0.38 0 0 / 0.14)" },
];

interface SortableCellProps {
  item: PageItem;
  pageNumber: number;
  bytes: Uint8Array | undefined;
  tint: SectionTint;
  isLast: boolean;
  onRotate: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleSplit: (id: string) => void;
  rotateAria: string;
  deleteAria: string;
  dividerLabel: string;
}

function SortableCell({
  item,
  pageNumber,
  bytes,
  tint,
  isLast,
  onRotate,
  onDelete,
  onToggleSplit,
  rotateAria,
  deleteAria,
  dividerLabel,
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
        tint={tint}
        onRotate={onRotate}
        onDelete={onDelete}
        rotateAria={rotateAria}
        deleteAria={deleteAria}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
      {isLast ? (
        // Reserve the gutter so the last page keeps the uniform 168px column
        // width (no divider after the final page — a trailing split is a no-op).
        <div className="w-[18px] shrink-0" aria-hidden="true" />
      ) : (
        <Divider
          active={item.splitAfter}
          onToggle={() => onToggleSplit(item.id)}
          label={dividerLabel}
        />
      )}
    </div>
  );
}

interface PdfArrangeProps {
  labels: PdfArrangeLabels;
  /** When mounted inline in Screen3Workspace, suppress page-level card chrome. */
  inline?: boolean;
}

export function PdfArrange({ labels, inline = false }: PdfArrangeProps) {
  const [items, setItems] = useState<PageItem[]>([]);
  const [sourceBytesById, setSourceBytesById] = useState<
    Map<string, Uint8Array>
  >(new Map());
  const [loadingPages, setLoadingPages] = useState(false);
  const [oversizeDismissed, setOversizeDismissed] = useState(false);
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
  } = useToolProcessor<ArrangeResult>({
    processor: async (_files, onProgress) => {
      const sections = splitIntoSections(items);
      if (sections.length === 0) throw new Error("출력할 페이지가 없습니다.");
      const outBytes = await assembleSections(
        { sections, sourceBytesById },
        onProgress,
      );
      const base = deriveBaseName(items[0]?.sourceFileName);
      const { fileNames } = buildOutputNames(base, outBytes.length);
      const outputs: OutputEntry[] = outBytes.map((data, i) => ({
        name: fileNames[i],
        data,
        pageCount: sections[i].length,
        cover: sections[i][0],
      }));
      return { outputs, isZip: outBytes.length > 1, base };
    },
    onDownload: async (res) => {
      const packaged = await packageOutputs(
        res.outputs.map((o) => o.data),
        res.base,
      );
      downloadBlob(
        packaged.data,
        packaged.filename,
        packaged.type === "zip" ? "application/zip" : "application/pdf",
      );
    },
  });

  const handleDownloadOne = useCallback((entry: OutputEntry) => {
    downloadBlob(entry.data, entry.name, "application/pdf");
  }, []);

  // Drop cached pdfjs docs / object URLs when the editor unmounts.
  useEffect(() => () => clearThumbnailCache(), []);

  const ingest = useCallback(
    async (incoming: File[], mode: "replace" | "append") => {
      if (incoming.length === 0) return;

      // Normalize HEIC/HEIF → JPEG first (PDFs and other images pass through).
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

      // Per-file size guard — mirrors FileUpload's dropzone limit on the add path
      // (the hidden <input> bypasses react-dropzone's maxSize check).
      const accepted = normalized.filter((f) => f.size <= uploadLimitFor("pdf-arrange"));
      for (const f of normalized) {
        if (f.size > uploadLimitFor("pdf-arrange")) {
          toast.error(
            `${f.name}: 파일 크기가 ${formatBytes(uploadLimitFor("pdf-arrange"))}를 초과합니다.`,
          );
        }
      }
      if (accepted.length === 0) {
        setLoadingPages(false);
        return;
      }

      try {
        const built = await buildPageItems(accepted);
        for (const name of built.failed) {
          toast.error(`${name}: 손상되었거나 암호화된 PDF입니다.`);
        }
        if (built.items.length === 0) return;

        if (mode === "replace") {
          clearThumbnailCache();
          setItems(built.items);
          setSourceBytesById(built.sourceBytesById);
          setFiles(accepted);
          setOversizeDismissed(false);
        } else {
          setItems((prev) => [...prev, ...built.items]);
          setSourceBytesById(
            (prev) => new Map([...prev, ...built.sourceBytesById]),
          );
          setFiles((prev) => [...prev, ...accepted]);
        }
      } catch (err) {
        toast.error(
          getErrorMessage(err, {
            fallbackMessage: "파일을 읽을 수 없습니다.",
          }).message,
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

  // Re-upload button: open the picker directly and REPLACE the current files.
  const handleReuploadPick = useCallback(() => {
    pendingModeRef.current = "replace";
    retry();
    fileInputRef.current?.click();
  }, [retry]);

  // "+" add card: open the picker and APPEND to the current files.
  const handleAddClick = useCallback(() => {
    pendingModeRef.current = "append";
    fileInputRef.current?.click();
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // Ignore picks while a prior upload is still being prepared (the
      // re-upload / add buttons are disabled, but the OS picker can race).
      if (loadingPages) {
        e.target.value = "";
        return;
      }
      const picked = e.target.files ? Array.from(e.target.files) : [];
      if (picked.length > 0) void ingest(picked, pendingModeRef.current);
      e.target.value = "";
    },
    [ingest, loadingPages],
  );

  const handleRotate = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, rotation: (((p.rotation + 90) % 360) as Rotation) }
          : p,
      ),
    );
  }, []);

  const handleDelete = useCallback((id: string) => {
    // Hard removal so following pages pull forward (no gap, no dimmed ghost).
    setItems((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleToggleSplit = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((p) => (p.id === id ? { ...p, splitAfter: !p.splitAfter } : p)),
    );
  }, []);

  const handleSplitAll = useCallback(() => {
    setItems((prev) => prev.map((p) => ({ ...p, splitAfter: true })));
  }, []);

  const handleClearSplits = useCallback(() => {
    setItems((prev) => prev.map((p) => ({ ...p, splitAfter: false })));
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
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

  // Map each page id → its section tint (cycled), recomputed when items change.
  const tintById = useMemo(() => {
    const map = new Map<string, SectionTint>();
    splitIntoSections(items).forEach((section, si) => {
      const tint = TINTS[si % TINTS.length];
      for (const it of section) map.set(it.id, tint);
    });
    return map;
  }, [items]);

  const totalBytes = useMemo(() => {
    let sum = 0;
    for (const b of sourceBytesById.values()) sum += b.byteLength;
    return sum;
  }, [sourceBytesById]);
  const showOversize =
    totalBytes > totalSizeWarnFor("pdf-arrange") && !oversizeDismissed;

  const sectionCount = countSections(items);
  const hasFiles = items.length > 0;
  const busy = status === "processing";

  const filesSummary =
    files.length <= 1
      ? template(labels.filesOneTemplate, { name: files[0]?.name ?? "" })
      : template(labels.filesManyTemplate, {
          name: files[0].name,
          rest: files.length - 1,
        });

  const editor = (
    <div className="space-y-3" style={{ minHeight: "var(--tray-h)" }}>
      {showOversize && (
        <OversizeNotice
          totalBytes={totalBytes}
          warning={labels.fileUpload.oversizeWarning}
          dismissLabel={labels.fileUpload.dismiss}
          onDismiss={() => setOversizeDismissed(true)}
        />
      )}

      <div
        className="ob-scroll max-h-[400px] overflow-y-auto rounded-2xl p-3"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow:
            "var(--shadow-md), inset 0 1px 0 rgba(255,255,255,0.8)",
        }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((p) => p.id)}
            strategy={rectSortingStrategy}
          >
            <div className="flex flex-wrap justify-center gap-0">
              {items.map((item, i) => (
                <SortableCell
                  key={item.id}
                  item={item}
                  pageNumber={i + 1}
                  bytes={sourceBytesById.get(item.sourceFileId)}
                  tint={tintById.get(item.id) ?? TINTS[0]}
                  isLast={i === items.length - 1}
                  onRotate={handleRotate}
                  onDelete={handleDelete}
                  onToggleSplit={handleToggleSplit}
                  rotateAria={labels.rotateAria}
                  deleteAria={labels.deleteAria}
                  dividerLabel={labels.clearSplits}
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
                {/* Match the page cells' trailing gutter for uniform columns. */}
                <div className="w-[18px] shrink-0" aria-hidden="true" />
              </div>
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );

  // Split all / Clear dividers are editing actions — only meaningful while
  // arranging (idle), so they ride in the header's extraActions slot in idle.
  const editorActions =
    status === "idle" ? (
      <>
        <button
          type="button"
          onClick={handleSplitAll}
          disabled={busy || loadingPages}
          className="subtle-action shrink-0 rounded-[5px] px-2.5 py-1.5 font-body text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {labels.splitAll}
        </button>
        <button
          type="button"
          onClick={handleClearSplits}
          disabled={busy || loadingPages}
          className="subtle-action shrink-0 rounded-[5px] px-2.5 py-1.5 font-body text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {labels.clearSplits}
        </button>
      </>
    ) : undefined;

  const header = (
    <ToolHeader
      title={labels.title}
      description={labels.description}
      hasFile={hasFiles}
      fileSummary={filesSummary}
      status={status}
      onReupload={handleReuploadPick}
      reuploadLabel={labels.reupload}
      busy={busy || loadingPages}
      busyReuploadLabel={labels.fileUpload.busy}
      executeLabel={template(labels.applyTemplate, { n: sectionCount })}
      processingLabel={labels.processing}
      againLabel={labels.again}
      onExecute={run}
      onAgain={retry}
      executeDisabled={!hasFiles}
      extraActions={editorActions}
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
          accept={ACCEPT}
          multiple
          hideFileList
          maxSize={uploadLimitFor("pdf-arrange")}
          busy={loadingPages}
          onFiles={handleUpload}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={{ ...labels.fileUpload, maxSize: labels.uploadMaxSize }}
        />
      ) : status === "idle" ? (
        editor
      ) : status === "done" && result ? (
        <PdfArrangeResult
          result={result}
          sourceBytesById={sourceBytesById}
          labels={labels}
          onDownloadAll={download}
          onDownloadOne={handleDownloadOne}
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
