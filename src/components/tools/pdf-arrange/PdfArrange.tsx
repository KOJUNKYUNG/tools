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
import { LayoutGridIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { getErrorMessage } from "@/lib/errors";
import {
  type PackagedOutput,
  assembleSections,
  packageOutputs,
} from "@/lib/pdf/assembleSections";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import {
  type PageItem,
  type Rotation,
  countSections,
  splitIntoSections,
} from "@/lib/pdf/pageItem";
import { buildPageItems, deriveBaseName } from "./buildPageItems";
import { Divider } from "./Divider";
import { EditorTopStrip } from "./EditorTopStrip";
import { PageItemCard, type SectionTint } from "./PageItemCard";
import type { PdfArrangeLabels } from "./labels";
import { clearThumbnailCache } from "./thumbnailCache";

const ACCEPT = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};
const ACCEPT_ATTR = "application/pdf,image/png,image/jpeg";

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
  showDivider: boolean;
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
  showDivider,
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
      {showDivider && (
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
  const addInputRef = useRef<HTMLInputElement | null>(null);

  const { files, setFiles, status, progress, errorMessage, run, retry, download } =
    useToolProcessor<PackagedOutput>({
      processor: async (_files, onProgress) => {
        const sections = splitIntoSections(items);
        if (sections.length === 0) throw new Error("출력할 페이지가 없습니다.");
        const outputs = await assembleSections(
          { sections, sourceBytesById },
          onProgress,
        );
        return packageOutputs(
          outputs,
          deriveBaseName(items[0]?.sourceFileName),
        );
      },
      onDownload: (res) =>
        downloadBlob(
          res.data,
          res.filename,
          res.type === "zip" ? "application/zip" : "application/pdf",
        ),
    });

  // Drop cached pdfjs docs / object URLs when the editor unmounts.
  useEffect(() => () => clearThumbnailCache(), []);

  const ingest = useCallback(
    async (newFiles: File[], mode: "replace" | "append") => {
      if (newFiles.length === 0) return;
      setLoadingPages(true);
      try {
        const built = await buildPageItems(newFiles);
        if (mode === "replace") {
          clearThumbnailCache();
          setItems(built.items);
          setSourceBytesById(built.sourceBytesById);
          setFiles(newFiles);
        } else {
          setItems((prev) => [...prev, ...built.items]);
          setSourceBytesById(
            (prev) => new Map([...prev, ...built.sourceBytesById]),
          );
          setFiles([...files, ...newFiles]);
        }
      } catch (err) {
        toast.error(
          getErrorMessage(err, {
            fallbackMessage: "파일을 읽을 수 없습니다. 손상되었거나 암호화된 PDF일 수 있습니다.",
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

  const handleReupload = useCallback(() => {
    retry();
    clearThumbnailCache();
    setItems([]);
    setSourceBytesById(new Map());
    setFiles([]);
  }, [retry, setFiles]);

  const handleAddClick = useCallback(() => addInputRef.current?.click(), []);

  const handleAddInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files ? Array.from(e.target.files) : [];
      if (picked.length > 0) void ingest(picked, "append");
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
      <EditorTopStrip
        filesSummary={filesSummary}
        onReupload={handleReupload}
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
        className="ob-scroll max-h-[480px] overflow-y-auto rounded-2xl p-4"
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
                  showDivider={i < items.length - 1}
                  onRotate={handleRotate}
                  onDelete={handleDelete}
                  onToggleSplit={handleToggleSplit}
                  rotateAria={labels.rotateAria}
                  deleteAria={labels.deleteAria}
                  dividerLabel={labels.clearSplits}
                />
              ))}
              <div className="flex items-stretch" style={{ marginLeft: "18px" }}>
                <button
                  type="button"
                  onClick={handleAddClick}
                  aria-label={labels.addAria}
                  title={labels.addAria}
                  className="my-[9px] flex h-[204px] w-[150px] items-center justify-center rounded-lg border-[1.5px] border-dashed text-[color:var(--ink-soft)] transition-colors hover:border-[color:var(--accent-electric)] hover:text-[color:var(--accent-electric)]"
                  style={{
                    borderColor: "var(--hairline)",
                    background: "var(--bg-soft, var(--silver-100))",
                  }}
                >
                  <PlusIcon className="size-7" />
                </button>
              </div>
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );

  const body = (
    <div className={inline ? "space-y-5" : "space-y-5 px-6 py-4"}>
      <input
        ref={addInputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        onChange={handleAddInput}
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
        onClick={handleReupload}
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
          {totalBytes > 0 && (
            <div className="mt-1 text-[11px] text-[color:var(--ink-soft)]">
              {formatBytes(totalBytes)}
            </div>
          )}
        </div>
      </div>
      {body}
    </div>
  );
}
