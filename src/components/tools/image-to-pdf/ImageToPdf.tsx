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
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/common/FileUpload";
import { OversizeNotice } from "@/components/common/OversizeNotice";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { ToolHeader } from "@/components/common/ToolHeader";
import { PageItemCard } from "@/components/pdf-editor/PageItemCard";
import { buildPageItems, deriveBaseName } from "@/components/pdf-editor/buildPageItems";
import { clearThumbnailCache } from "@/components/pdf-editor/thumbnailCache";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { totalSizeWarnFor, uploadLimitFor } from "@/lib/constants";
import { getErrorMessage } from "@/lib/errors";
import { normalizeImageFiles } from "@/lib/image/heic";
import { displayedSize, readImageHeader } from "@/lib/output-check/imageHeader";
import { convertImagesToPdf } from "@/lib/pdf/assembleSections";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { type PageItem, type Rotation } from "@/lib/pdf/pageItem";
import {
  type CustomSizeMm,
  type PageMargin,
  type PageOrientation,
  type PagePreset,
  type PageSize,
  type PageSizeMode,
  customFromPreset,
  marginPt,
  pageBoxPt,
} from "@/lib/pdf/pageSize";
import { ImageToPdfResult } from "./ImageToPdfResult";
import { PageSizeSelector } from "./PageSizeSelector";
import type { ImageToPdfLabels } from "./labels";

const ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
};
const ACCEPT_ATTR = "image/png,image/jpeg,image/heic,image/heif,.heic,.heif";

const NEUTRAL_TINT = { ring: "transparent" } as const;

/** The page a picture is made on, as its editor card draws it. */
interface CardPage {
  /** Width / height. */
  aspect: number;
  /** The margin's share of the page's width. */
  marginRatio: number;
  /** Fill page: the picture covers the frame, cut at its edges. */
  fill: boolean;
}

/**
 * The page `item` will be made on, for its editor card: the picture's shown
 * size (EXIF orientation, then the user's turn) put through the same page
 * and margin rules as the engine; under fill page the picture covers the
 * frame, cut at its centre as the engine cuts it. Null under image fit, where the picture is
 * the page. A picture whose header cannot be read gets the size as listed.
 */
function cardPage(
  pageSize: PageSize,
  orientation: PageOrientation,
  margin: PageMargin,
  item: PageItem,
  bytes: Uint8Array | undefined,
): CardPage | null {
  const header = bytes ? readImageHeader(bytes) : null;
  const [w, h] = header ? displayedSize(header) : [1, 1];
  const box = pageBoxPt(pageSize, w, h, item.rotation, orientation);
  if (!box) return null;
  if (margin === "fill") return { aspect: box.width / box.height, marginRatio: 0, fill: true };
  return { aspect: box.width / box.height, marginRatio: marginPt(box, margin) / box.width, fill: false };
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
  page: CardPage | null;
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
  page,
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
        pageAspect={page?.aspect ?? null}
        pageMarginRatio={page?.marginRatio ?? 0}
        pageFill={page?.fill ?? false}
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
  const [sizeMode, setSizeMode] = useState<PageSizeMode>("preset");
  const [preset, setPreset] = useState<PagePreset>("a4");
  const [custom, setCustom] = useState<CustomSizeMm>(() => customFromPreset("a4"));
  // The preset the custom fields were last filled from: switching to custom
  // refills them only after another preset was chosen, so sizes typed there
  // survive a look at image fit or the same preset.
  const [customSeed, setCustomSeed] = useState<PagePreset>("a4");
  const [orientation, setOrientation] = useState<PageOrientation>("auto");
  const [margin, setMargin] = useState<PageMargin>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingModeRef = useRef<"replace" | "append">("append");

  const pageSize = useMemo<PageSize>(() => {
    if (sizeMode === "preset") return { kind: "preset", preset };
    if (sizeMode === "custom") return { kind: "custom", ...custom };
    return { kind: "image-fit" };
  }, [sizeMode, preset, custom]);

  const handleModeChange = useCallback(
    (next: PageSizeMode) => {
      if (next === "custom" && customSeed !== preset) {
        setCustom(customFromPreset(preset));
        setCustomSeed(preset);
      }
      setSizeMode(next);
    },
    [customSeed, preset],
  );

  const {
    files,
    setFiles,
    status,
    progress,
    runLine,
    errorMessage,
    result,
    run,
    retry,
    download,
  } = useToolProcessor<ImageToPdfResultData>({
    processor: async (_files, onProgress) => {
      const live = items.filter((p) => !p.deleted);
      if (live.length === 0) throw new Error("no images to convert"); // Convert is disabled then
      const bytes = await convertImagesToPdf(
        { pages: live, sourceBytesById, pageSize, orientation, margin },
        onProgress,
      );
      const name = `${deriveBaseName(items[0]?.sourceFileName)}.pdf`;
      return { bytes, name, pageCount: live.length };
    },
    onDownload: (res) => downloadBlob(res.bytes, res.name, "application/pdf"),
    errorOptions: { copy: labels.errors, corruptOutputHint: labels.errorCorrupt },
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
          getErrorMessage(err, { copy: labels.errors, fallbackMessage: labels.errors.heicConvertFailed }).message,
        );
        setLoadingPages(false);
        return;
      }

      // Images only — drop anything that isn't an accepted image.
      const images = normalized.filter((f) => f.type === "image/png" || f.type === "image/jpeg");
      for (const f of normalized) {
        if (!(f.type === "image/png" || f.type === "image/jpeg")) {
          toast.error(template(labels.fileUpload.invalidTypeTemplate, { name: f.name }));
        }
      }
      const accepted = images.filter((f) => f.size <= uploadLimitFor("image-to-pdf"));
      for (const f of images) {
        if (f.size > uploadLimitFor("image-to-pdf")) {
          toast.error(
            template(labels.fileUpload.tooLargeTemplate, {
              name: f.name,
              size: formatBytes(uploadLimitFor("image-to-pdf")),
            }),
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
        } else {
          setItems((prev) => [...prev, ...built.items]);
          setSourceBytesById((prev) => new Map([...prev, ...built.sourceBytesById]));
          setFiles((prev) => [...prev, ...accepted]);
        }
      } catch (err) {
        toast.error(
          getErrorMessage(err, { copy: labels.errors, fallbackMessage: labels.errors.readFailed }).message,
        );
      } finally {
        setLoadingPages(false);
      }
    },
    [files, setFiles, labels.errors, labels.fileUpload],
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
  // Deleted pages stay in `items`; only the rest are converted.
  const liveCount = items.filter((p) => !p.deleted).length;
  const busy = status === "processing";

  const [oversizeDismissed, setOversizeDismissed] = useState(false);
  const totalBytes = useMemo(
    () => files.reduce((sum, f) => sum + f.size, 0),
    [files],
  );
  const showOversize =
    totalBytes > totalSizeWarnFor("image-to-pdf") && !oversizeDismissed;

  const filesSummary =
    files.length <= 1
      ? template(labels.filesOneTemplate, { name: files[0]?.name ?? "" })
      : template(labels.filesManyTemplate, {
          name: files[0].name,
          rest: files.length - 1,
        });

  const editor = (
    <div className="flex flex-col gap-3" style={{ height: "var(--tray-h)" }}>
      <PageSizeSelector
        mode={sizeMode}
        onModeChange={handleModeChange}
        preset={preset}
        onPresetChange={setPreset}
        custom={custom}
        onCustomChange={setCustom}
        orientation={orientation}
        onOrientationChange={setOrientation}
        margin={margin}
        onMarginChange={setMargin}
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
                  page={cardPage(
                    pageSize,
                    orientation,
                    margin,
                    item,
                    sourceBytesById.get(item.sourceFileId),
                  )}
                />
              ))}
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={handleAddClick}
                  aria-label={labels.addAria}
                  title={labels.addAria}
                  className="my-[9px] flex h-[204px] w-[150px] items-center justify-center rounded-[3px] border-[1.5px] border-dashed text-[color:var(--ink-soft)] transition-colors hover:border-[color:var(--emphasis)] hover:text-[color:var(--emphasis)]"
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
          accept={ACCEPT}
          multiple
          hideFileList
          maxSize={uploadLimitFor("image-to-pdf")}
          busy={loadingPages}
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
          lang={lang}
          router={router}
        />
      ) : (
        <ProcessingStatus
          status={status}
          progress={progress}
          runLine={runLine}
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
