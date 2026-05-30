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
import { ImagePlus, PlusIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { PageItemCard } from "@/components/pdf-editor/PageItemCard";
import { buildPageItems, deriveBaseName } from "@/components/pdf-editor/buildPageItems";
import { clearThumbnailCache } from "@/components/pdf-editor/thumbnailCache";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { FILE_SIZE_LIMIT } from "@/lib/constants";
import { getErrorMessage } from "@/lib/errors";
import { type PageItem } from "@/lib/pdf/pageItem";
import { buildPptx, type BuildPptxInput } from "@/lib/pptx/assemblePptx";
import { type Box, computeSlidePlacement, type PlacementAlign } from "@/lib/pptx/slidePlacement";
import { SLIDE_SIZES, type SlideKind } from "@/lib/pptx/slideSize";
import { downloadBlobObject } from "@/lib/pdf/downloadBlob";
import { consumeStagedFiles } from "@/lib/common/toolHandoff";
import { AlignSelector } from "./AlignSelector";
import { BackgroundPicker, type BgChoice } from "./BackgroundPicker";
import { PlacementControls } from "./PlacementControls";
import { PlacementEditor } from "./PlacementEditor";
import { SlideAspectSelector } from "./SlideAspectSelector";
import { ImageToPptxResult } from "./ImageToPptxResult";
import type { ImageToPptxLabels } from "./labels";

const ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};
const ACCEPT_ATTR = "image/png,image/jpeg";

const NEUTRAL_TINT = { ring: "transparent" } as const;

export interface ImageToPptxResultData {
  bytes: Uint8Array;
  name: string;
  slideCount: number;
}

interface SortableCellProps {
  item: PageItem;
  pageNumber: number;
  bytes: Uint8Array | undefined;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  duplicateAria: string;
  deleteAria: string;
  pageAspect: number;
}

function SortableCell({
  item,
  pageNumber,
  bytes,
  onDuplicate,
  onDelete,
  duplicateAria,
  deleteAria,
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
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        duplicateAria={duplicateAria}
        deleteAria={deleteAria}
        frameBg="var(--silver-100)"
        pageAspect={pageAspect}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
      <div className="w-[18px] shrink-0" aria-hidden="true" />
    </div>
  );
}

interface ImageToPptxProps {
  labels: ImageToPptxLabels;
  lang: string;
  inline?: boolean;
}

export function ImageToPptx({ labels, lang, inline = false }: ImageToPptxProps) {
  // lang is passed through to result but not used directly here
  void lang;

  const [items, setItems] = useState<PageItem[]>([]);
  const [sourceBytesById, setSourceBytesById] = useState<Map<string, Uint8Array>>(
    new Map(),
  );
  // Map from sourceFileId → File object, kept in sync with items/sourceBytesById
  const [fileById, setFileById] = useState<Map<string, File>>(new Map());
  // Map from sourceFileId → object URL (for refImageUrl preview in PlacementEditor)
  const [sourceUrlById, setSourceUrlById] = useState<Map<string, string>>(new Map());
  const prevBgUrlRef = useRef<string | null>(null);

  const [loadingPages, setLoadingPages] = useState(false);
  // Box in INCHES on the slide
  const [box, setBox] = useState<Box>({ x: 1.33, y: 0.75, w: 10.67, h: 6 });
  const [slideKind, setSlideKind] = useState<SlideKind>("16:9");
  const [bg, setBg] = useState<BgChoice>({ kind: "color", color: "#FFFFFF" });
  const [align, setAlign] = useState<PlacementAlign>("top-left");

  // Natural pixel dimensions of the first (reference) image, tagged with the
  // sourceFileId it was measured for so async loads can't be applied to the
  // wrong image (reupload race).
  const [refNatural, setRefNatural] = useState<{ id: string; w: number; h: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingModeRef = useRef<"replace" | "append">("append");
  // Track which sourceFileId the box was last auto-initialised for
  const initedForRef = useRef<string | null>(null);

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
  } = useToolProcessor<ImageToPptxResultData>({
    processor: async (_files, onProgress) => {
      const live = items.filter((p) => !p.deleted);
      if (live.length === 0) throw new Error("슬라이드로 만들 이미지가 없습니다.");
      const orderedFiles = live
        .map((p) => fileById.get(p.sourceFileId))
        .filter((f): f is File => !!f);
      if (orderedFiles.length === 0) throw new Error("슬라이드로 만들 이미지가 없습니다.");
      const background: BuildPptxInput["background"] =
        bg.kind === "color"
          ? { kind: "color", color: bg.color.replace("#", "") }
          : { kind: "image", file: bg.file };
      const bytes = await buildPptx(
        { files: orderedFiles, box, slideKind, background, align },
        onProgress,
      );
      const name = `${deriveBaseName(items[0]?.sourceFileName)}.pptx`;
      return { bytes, name, slideCount: orderedFiles.length };
    },
    onDownload: (res) =>
      downloadBlobObject(
        new Blob([res.bytes.buffer as ArrayBuffer], {
          type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        }),
        res.name,
      ),
  });

  // Cleanup thumbnail cache on unmount
  useEffect(() => () => clearThumbnailCache(), []);

  // Manage object URLs for source images (for PlacementEditor refImageUrl)
  // Keyed on sourceUrlById entries so we only recreate when files change
  useEffect(() => {
    if (items.length === 0) return;
    // Build new URL map for all current non-deleted items
    const newUrlMap = new Map<string, string>();
    for (const item of items) {
      const file = fileById.get(item.sourceFileId);
      if (file && !newUrlMap.has(item.sourceFileId)) {
        newUrlMap.set(item.sourceFileId, URL.createObjectURL(file));
      }
    }
    setSourceUrlById(newUrlMap);
    return () => {
      for (const url of newUrlMap.values()) {
        URL.revokeObjectURL(url);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileById]);

  // Track and revoke previous background image URL when bg changes to a new image
  useEffect(() => {
    if (bg.kind === "image") {
      if (prevBgUrlRef.current && prevBgUrlRef.current !== bg.url) {
        URL.revokeObjectURL(prevBgUrlRef.current);
      }
      prevBgUrlRef.current = bg.url;
    }
  }, [bg]);

  const liveItems = items.filter((p) => !p.deleted);
  const firstId = liveItems[0]?.sourceFileId ?? null;

  // The first live item's source URL for use in PlacementEditor preview
  const refImageUrl = firstId ? (sourceUrlById.get(firstId) ?? null) : null;

  // Load natural dimensions of the reference (first) image, tagged with its id.
  useEffect(() => {
    if (!refImageUrl || !firstId) {
      setRefNatural(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setRefNatural({ id: firstId, w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      if (!cancelled) setRefNatural(null);
    };
    img.src = refImageUrl;
    return () => { cancelled = true; };
  }, [refImageUrl, firstId]);

  // Derive slide dims and reference placement in inches. Only trust refNatural
  // when it matches the current first image (else it's a stale async load).
  const slide = SLIDE_SIZES[slideKind];
  const ref =
    refNatural && firstId && refNatural.id === firstId
      ? computeSlidePlacement({ x: 0, y: 0, w: slide.w, h: slide.h }, refNatural.w, refNatural.h)
      : null;

  // Auto-init box once per reference-image identity (NOT on slide toggle). `ref`
  // is null until the correct image's natural size has loaded, so this never
  // fires with stale dimensions on reupload.
  useEffect(() => {
    if (!ref || !firstId) return;
    if (initedForRef.current === firstId) return;
    setBox({
      x: (slide.w - ref.w) / 2,
      y: (slide.h - ref.h) / 2,
      w: ref.w,
      h: ref.h,
    });
    initedForRef.current = firstId;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, firstId, slide.w, slide.h]);

  // Clamp box into new slide bounds when slide ratio toggles (image-invariant)
  useEffect(() => {
    setBox((prev) => {
      const w = Math.max(0.1, Math.min(slide.w, prev.w));
      const h = Math.max(0.1, Math.min(slide.h, prev.h));
      const x = Math.max(0, Math.min(prev.x, slide.w - w));
      const y = Math.max(0, Math.min(prev.y, slide.h - h));
      return { x, y, w, h };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideKind]);

  const ingest = useCallback(
    async (incoming: File[], mode: "replace" | "append") => {
      const images = incoming.filter(
        (f) => f.type === "image/png" || f.type === "image/jpeg",
      );
      for (const f of incoming) {
        if (!(f.type === "image/png" || f.type === "image/jpeg")) {
          toast.error(`${f.name}: 이미지(JPG/PNG)만 추가할 수 있습니다.`);
        }
      }
      const accepted = images.filter((f) => f.size <= FILE_SIZE_LIMIT.guest);
      for (const f of images) {
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
        if (built.items.length === 0) return;

        // Build fileById map: items and accepted correspond 1:1 by index
        // (each image file → one PageItem)
        const newFileById = new Map<string, File>();
        built.items.forEach((item, idx) => {
          const file = accepted[idx];
          if (file) newFileById.set(item.sourceFileId, file);
        });

        if (mode === "replace") {
          clearThumbnailCache();
          // Force placement re-init for the new upload (even if the same file
          // yields the same sourceFileId) → box recenters at 100% W/H.
          initedForRef.current = null;
          setItems(built.items);
          setSourceBytesById(built.sourceBytesById);
          setFileById(newFileById);
          setFiles(accepted);
        } else {
          setItems((prev) => [...prev, ...built.items]);
          setSourceBytesById((prev) => new Map([...prev, ...built.sourceBytesById]));
          setFileById((prev) => new Map([...prev, ...newFileById]));
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

  // Consume staged files on mount (StrictMode-safe via consumedRef)
  const consumedRef = useRef(false);
  useEffect(() => {
    if (consumedRef.current) return;
    consumedRef.current = true;
    const staged = consumeStagedFiles();
    if (staged && staged.files.length > 0) void ingest(staged.files, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setFileById(new Map());
    setFiles([]);
    initedForRef.current = null;
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

  const handleDuplicate = useCallback((id: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx === -1) return prev;
      const orig = prev[idx];
      const copy = {
        ...orig,
        id: `${orig.id}__dup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
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

  const filesSummary = useMemo(() => {
    return files.length <= 1
      ? template(labels.filesOneTemplate, { name: files[0]?.name ?? "" })
      : template(labels.filesManyTemplate, {
          name: files[0].name,
          rest: files.length - 1,
        });
  }, [files, labels.filesOneTemplate, labels.filesManyTemplate]);

  const slideAspect = slide.w / slide.h;

  const editor = (
    <div className="flex flex-col gap-3" style={{ height: "52vh" }}>
      {/* Top strip: files summary + reupload + convert */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 truncate font-body text-[12px]" style={{ color: "var(--ink)" }}>
          {filesSummary}
        </div>
        <button
          type="button"
          onClick={handleReuploadPick}
          className="nameplate inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] px-3 font-display text-[12px]"
        >
          {labels.reupload}
        </button>
        <button
          type="button"
          onClick={run}
          disabled={!hasFiles || busy}
          className="btn-download glint inline-flex h-8 shrink-0 items-center justify-center rounded-[9px] px-4 font-display text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          {template(labels.convertTemplate, { n: liveItems.length })}
        </button>
      </div>

      {/* Two-column editor: left = image grid, right = slide controls */}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* Left: DnD image grid */}
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
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                    duplicateAria={labels.duplicateAria}
                    deleteAria={labels.deleteAria}
                    pageAspect={slideAspect}
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
                  <div className="w-[18px] shrink-0" aria-hidden="true" />
                </div>
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Right: slide settings controls */}
        <div
          className="ob-scroll flex w-[220px] shrink-0 flex-col gap-3 overflow-y-auto rounded-2xl p-3"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-md), inset 0 1px 0 rgba(255,255,255,0.8)",
          }}
        >
          <SlideAspectSelector value={slideKind} onChange={setSlideKind} labels={labels} />
          <AlignSelector value={align} onChange={setAlign} labels={labels} />
          <BackgroundPicker value={bg} onChange={setBg} labels={labels} />
          <PlacementEditor
            box={box}
            onBoxChange={setBox}
            slideW={slide.w}
            slideH={slide.h}
            background={
              bg.kind === "color"
                ? { kind: "color", color: bg.color }
                : { kind: "image", url: bg.url }
            }
            refImageUrl={refImageUrl}
            align={align}
          />
          <PlacementControls
            box={box}
            onBoxChange={setBox}
            slideW={slide.w}
            slideH={slide.h}
            refSize={ref}
            labels={labels}
          />
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
          accept={ACCEPT}
          multiple
          hideFileList
          onFiles={handleUpload}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={{ ...labels.fileUpload, maxSize: labels.uploadMaxSize }}
        />
      ) : status === "idle" ? (
        editor
      ) : status === "done" && result ? (
        <ImageToPptxResult
          result={result}
          labels={labels}
          onDownload={download}
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
        aria-label={labels.reupload}
        title={labels.reupload}
        className="absolute right-6 top-4 z-10 rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        style={{ color: "var(--ink-soft)" }}
      >
        <RotateCcwIcon className="size-4" />
      </button>
      <div className="flex items-start gap-3 border-b px-6 pb-3 pt-3" style={{ borderColor: "var(--border)" }}>
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-[5px]"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink-strong)" }}
        >
          <ImagePlus size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display font-ko text-[16px] font-semibold leading-[1.2] tracking-[0.005em]" style={{ color: "var(--headline)" }}>
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
