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
import { LayoutGridIcon, PlusIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { FILE_SIZE_LIMIT } from "@/lib/constants";
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
import { buildPageItems, deriveBaseName } from "./buildPageItems";
import { Divider } from "./Divider";
import { EditorTopStrip } from "./EditorTopStrip";
import { PageItemCard, type SectionTint } from "./PageItemCard";
import {
  type ArrangeResult,
  type OutputEntry,
  PdfArrangeResult,
} from "./PdfArrangeResult";
import type { PdfArrangeLabels } from "./labels";
import { clearThumbnailCache } from "./thumbnailCache";

const ACCEPT = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};
const ACCEPT_ATTR = "application/pdf,image/png,image/jpeg";

/** Total upload size above which we show a soft (dismissible) slowness warning. */
const OVERSIZE_THRESHOLD = 100 * 1024 * 1024;

/** Per-section ring tints, cycled across sections (electric / copper / silver). */
const TINTS: SectionTint[] = [
  { ring: "oklch(0.62 0.15 250 / 0.08)" },
  { ring: "oklch(0.68 0.13 55 / 0.10)" },
  { ring: "oklch(0.52 0.012 250 / 0.11)" },
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

      // Per-file size guard — mirrors FileUpload's dropzone limit on the add path
      // (the hidden <input> bypasses react-dropzone's maxSize check).
      const accepted = incoming.filter((f) => f.size <= FILE_SIZE_LIMIT.guest);
      for (const f of incoming) {
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
          setFiles([...files, ...accepted]);
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

  // Header reset (top-right): clear everything back to the dropzone.
  const handleReset = useCallback(() => {
    retry();
    clearThumbnailCache();
    setItems([]);
    setSourceBytesById(new Map());
    setFiles([]);
  }, [retry, setFiles]);

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
      const picked = e.target.files ? Array.from(e.target.files) : [];
      if (picked.length > 0) void ingest(picked, pendingModeRef.current);
      e.target.value = "";
    },
    [ingest],
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
  const showOversize = totalBytes > OVERSIZE_THRESHOLD && !oversizeDismissed;

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
    <div className="space-y-3">
      {showOversize && (
        <div
          className="flex items-center justify-between gap-2 rounded-[8px] border px-3 py-2 text-[12px]"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--accent-copper)",
            color: "var(--ink-strong)",
          }}
        >
          <span>
            {template(labels.oversizeWarning, { size: formatBytes(totalBytes) })}
          </span>
          <button
            type="button"
            onClick={() => setOversizeDismissed(true)}
            aria-label={labels.dismiss}
            title={labels.dismiss}
            className="shrink-0 rounded p-1 transition-colors hover:text-[color:var(--ink-strong)]"
            style={{ color: "var(--ink-soft)" }}
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}

      <EditorTopStrip
        filesSummary={filesSummary}
        onReupload={handleReuploadPick}
        reuploadLabel={labels.reupload}
        onSplitAll={handleSplitAll}
        splitAllLabel={labels.splitAll}
        onClearSplits={handleClearSplits}
        clearSplitsLabel={labels.clearSplits}
        onApply={run}
        applyLabel={template(labels.applyTemplate, { n: sectionCount })}
        applyDisabled={!hasFiles}
        busy={busy}
      />

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
                  className="my-[9px] flex h-[204px] w-[150px] items-center justify-center rounded-[5px] border-[1.5px] border-dashed text-[color:var(--ink-soft)] transition-colors hover:border-[color:var(--accent-electric)] hover:text-[color:var(--accent-electric)]"
                  style={{
                    borderColor: "var(--hairline)",
                    background: "var(--bg-soft, var(--silver-100))",
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
          onFiles={handleUpload}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={{ maxSize: labels.uploadMaxSize }}
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
          onAgain={retry}
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
        aria-label={labels.reset}
        title={labels.reset}
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
          <LayoutGridIcon size={18} />
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
