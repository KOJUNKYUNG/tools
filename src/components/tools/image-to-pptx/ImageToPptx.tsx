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
import { PageItemCard } from "@/components/pdf-editor/PageItemCard";
import { buildPageItems, deriveBaseName } from "@/components/pdf-editor/buildPageItems";
import { clearThumbnailCache } from "@/components/pdf-editor/thumbnailCache";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { totalSizeWarnFor, uploadLimitFor } from "@/lib/constants";
import { getErrorMessage, UserFacingError } from "@/lib/errors";
import { type PageItem } from "@/lib/pdf/pageItem";
import { buildPptx, prepareBackgroundPicture, type BuildPptxInput } from "@/lib/pptx/assemblePptx";
import { type Box, computeSlidePlacement, type PlacementAlign } from "@/lib/pptx/slidePlacement";
import { SLIDE_SIZES, type SlideKind } from "@/lib/pptx/slideSize";
import { downloadBlobObject } from "@/lib/pdf/downloadBlob";
import { consumeStagedFiles } from "@/lib/common/toolHandoff";
import { normalizeImageFiles } from "@/lib/image/heic";
import { filledSize, sizedImagePreparation, type ScreenSize } from "@/lib/image/slideImage";
import { filteredColour } from "@/lib/image/filterSet";
import type { RunBackground, RunPicture } from "@/lib/background/resolveBackground";
import { PreviewLightbox } from "@/components/common/PreviewLightbox";
import { useBackgroundEditor } from "@/components/background-editor/useBackgroundEditor";
import { useActualBackground } from "@/components/background-editor/useActualBackground";
import { BackgroundEditor } from "@/components/background-editor/BackgroundEditor";
import type { FillBackground } from "@/lib/ppt/changeBackground";
import { AlignSelector } from "./AlignSelector";
import { BackgroundRow } from "./BackgroundRow";
import type { ShownBackground } from "./BackgroundFill";
import { PlacementControls } from "./PlacementControls";
import { boxStyle, PlacedPicture, PlacementEditor } from "./PlacementEditor";
import { ScreenSizeSelector } from "./ScreenSizeSelector";
import { SlideAspectSelector } from "./SlideAspectSelector";
import { ImageToPptxResult } from "./ImageToPptxResult";
import type { ImageToPptxLabels } from "./labels";

const ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
};
const ACCEPT_ATTR = "image/png,image/jpeg,image/heic,image/heif,.heic,.heif";

const NEUTRAL_TINT = { ring: "transparent" } as const;

/** A new deck's background until the user picks one. */
const WHITE: FillBackground = { kind: "colour", rgb: "FFFFFF" };

/** The resolved background as image-to-pptx's engine takes it; a new deck has no "no background". */
function engineBackground(background: RunBackground): BuildPptxInput["background"] {
  if (background.kind === "picture") return { kind: "image", file: background.file, crop: background.crop, step: background.step };
  if (background.fill.kind !== "colour") throw new Error("image-to-pptx: a new deck has no theme background");
  return { kind: "color", color: background.fill.rgb };
}

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
        frameBg="var(--surface-2)"
        pageAspect={pageAspect}
        fluid
        dragHandleProps={{ ...attributes, ...listeners }}
      />
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

  const [loadingPages, setLoadingPages] = useState(false);
  // Box in INCHES on the slide
  const [box, setBox] = useState<Box>({ x: 1.33, y: 0.75, w: 10.67, h: 6 });
  const [slideKind, setSlideKind] = useState<SlideKind>("16:9");
  // Deck-wide; Full HD unless the user asks for 4K (CONTEXT "Screen size").
  const [screen, setScreen] = useState<ScreenSize>("full-hd");
  const [align, setAlign] = useState<PlacementAlign>("top-left");
  const slide = SLIDE_SIZES[slideKind];
  /**
   * The deck's background, picked and cropped in the shared background editor
   * (gallery, solid colours, upload); its crop follows the slide's shape.
   * 다시 하기 and new slide pictures keep it.
   */
  const editor = useBackgroundEditor({
    slideRatio: slide.w / slide.h,
    copy: labels.editorCopy,
    initialFill: WHITE,
  });
  const {
    bgFile,
    fill,
    crop,
    previewUrl: bgUrl,
    cropSource,
    normalizing: bgNormalizing,
    solidColour,
    filters,
    editLive,
    editPending,
    filterPreview,
    resolveForRun,
  } = editor;
  /** The run can start: a colour, or a picture in hand (not a pick still on its way). */
  const bgReady = fill?.kind === "colour" || (!!bgFile && !bgNormalizing);
  /**
   * The background as the row's thumbnail and the preview show it: the colour
   * its colour effects make, or the picture cut to its crop, with the recipe
   * edit and the filters laid over it as they change.
   */
  const shownBg: ShownBackground = solidColour
    ? { kind: "color", color: filteredColour(filters, solidColour), filtered: filterPreview }
    : bgUrl
      ? { kind: "image", url: bgUrl, crop, sourceSize: cropSource ?? undefined, live: editLive, filtered: filterPreview }
      : { kind: "empty" };
  /** The preview enlarged over the right half, and whether it fills the screen. */
  const [zoomed, setZoomed] = useState(false);
  const [zoomFullscreen, setZoomFullscreen] = useState(false);
  /** The background file the run would put in, shown under the slide pictures while the zoom fills the screen. */
  const prepareActual = useCallback(
    async ({ file, crop: cut, step }: RunPicture) => {
      const dataUrl = await prepareBackgroundPicture(file, slideKind, screen, sizedImagePreparation, cut, step);
      return (await fetch(dataUrl)).blob();
    },
    [slideKind, screen],
  );
  const { url: actualUrl, pending: actualPending } = useActualBackground(editor, {
    active: zoomed && zoomFullscreen,
    slide,
    screen,
    prepare: prepareActual,
  });

  /** The left half shows the background editor ("바꾸기") in place of the slide pictures. */
  const [editingBg, setEditingBg] = useState(false);
  /**
   * The editor stays mounted once opened, hidden behind the slide pictures, so
   * its tab, scroll and colour picker are where the user left them.
   */
  const [editorMounted, setEditorMounted] = useState(false);

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
    runLine,
    errorMessage,
    result,
    run,
    retry,
    download,
  } = useToolProcessor<ImageToPptxResultData>({
    processor: async (_files, onProgress, needsScreen) => {
      const live = items.filter((p) => !p.deleted);
      if (live.length === 0) throw new UserFacingError(labels.errNoImages);
      const orderedFiles = live
        .map((p) => fileById.get(p.sourceFileId))
        .filter((f): f is File => !!f);
      if (orderedFiles.length === 0) throw new UserFacingError(labels.errNoImages);
      // The run is offered only once the background is in hand.
      if (!bgReady) throw new Error("image-to-pptx: run started before the background was ready");
      // The pick as the run puts it in: an edited recipe drawn, a solid colour
      // with grain or a Paper filter a picture of the colour, the filters the
      // step the engine runs between the fit and the format.
      const resolved = await resolveForRun({ slide, screen, needsScreen, onProgress });
      const bytes = await buildPptx(
        { files: orderedFiles, box, slideKind, background: engineBackground(resolved.background), align, screen },
        resolved.onProgress,
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
    errorOptions: { copy: labels.errors, corruptOutputHint: labels.errorCorrupt },
  });

  // Cleanup thumbnail cache on unmount
  useEffect(() => () => clearThumbnailCache(), []);

  // Per-key object URL manager: only creates URLs for new ids, revokes removed ids.
  const urlsRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const live = urlsRef.current;
    // add URLs for new ids
    for (const [id, file] of fileById) {
      if (!live.has(id)) live.set(id, URL.createObjectURL(file));
    }
    // revoke + drop URLs for removed ids
    for (const id of [...live.keys()]) {
      if (!fileById.has(id)) {
        URL.revokeObjectURL(live.get(id)!);
        live.delete(id);
      }
    }
    setSourceUrlById(new Map(live));
  }, [fileById]);
  // revoke all on unmount
  useEffect(() => () => {
    for (const url of urlsRef.current.values()) URL.revokeObjectURL(url);
    urlsRef.current.clear();
  }, []);

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

  // Derive the reference placement in inches. Only trust refNatural when it
  // matches the current first image (else it's a stale async load).
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

      const images = normalized.filter(
        (f) => f.type === "image/png" || f.type === "image/jpeg",
      );
      for (const f of normalized) {
        if (!(f.type === "image/png" || f.type === "image/jpeg")) {
          toast.error(template(labels.errNotImage, { name: f.name }));
        }
      }
      const accepted = images.filter((f) => f.size <= uploadLimitFor("image-to-pptx"));
      for (const f of images) {
        if (f.size > uploadLimitFor("image-to-pptx")) {
          toast.error(template(labels.errTooLarge, { name: f.name, size: formatBytes(uploadLimitFor("image-to-pptx")) }));
        }
      }
      if (accepted.length === 0) {
        setLoadingPages(false);
        return;
      }

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
          getErrorMessage(err, { copy: labels.errors, fallbackMessage: labels.errors.readFailed }).message,
        );
      } finally {
        setLoadingPages(false);
      }
    },
    [labels, setFiles],
  );

  /** "바꾸기": the left half becomes the background editor, the background as it stands held for "취소". */
  const { hold: holdBg, release: releaseBg, restore: restoreBg } = editor;
  const openBgEditor = useCallback(() => {
    holdBg();
    setEditorMounted(true);
    setEditingBg(true);
  }, [holdBg]);
  /** "완료": back to the slide pictures with the background as picked. */
  const finishBgEditor = useCallback(() => {
    releaseBg();
    setEditingBg(false);
  }, [releaseBg]);
  /** "취소": back to the slide pictures with the background from before "바꾸기". */
  const cancelBgEditor = useCallback(() => {
    restoreBg();
    setEditingBg(false);
  }, [restoreBg]);

  // Consume staged files on mount (StrictMode-safe via consumedRef)
  const consumedRef = useRef(false);
  useEffect(() => {
    if (consumedRef.current) return;
    consumedRef.current = true;
    const staged = consumeStagedFiles();
    if (staged && staged.files.length > 0) void ingest(staged.files, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 다시 하기: back to the settings with the background, its crop, edit and filters kept.
  const { again: againBg } = editor;
  const handleAgain = useCallback(() => {
    retry();
    againBg();
  }, [retry, againBg]);

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

  const [oversizeDismissed, setOversizeDismissed] = useState(false);
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const showOversize =
    totalBytes > totalSizeWarnFor("image-to-pptx") && !oversizeDismissed;

  const filesSummary = useMemo(() => {
    return files.length <= 1
      ? template(labels.filesOneTemplate, { name: files[0]?.name ?? "" })
      : template(labels.filesManyTemplate, {
          name: files[0].name,
          rest: files.length - 1,
        });
  }, [files, labels.filesOneTemplate, labels.filesManyTemplate]);

  const slideAspect = slide.w / slide.h;

  // The slide pictures in three columns. While a run uses them (running,
  // done or failed) they are shown read-only in the same cells, so the
  // workspace keeps its shape across states (UI stability contract).
  const editable = status === "idle";
  const showEditor = editingBg && editable;
  const pictures = editable ? (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((p) => p.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-3 content-start gap-2.5">
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
          <button
            type="button"
            onClick={handleAddClick}
            aria-label={labels.addAria}
            title={labels.addAria}
            className="flex w-full items-center justify-center rounded-[3px] border-[1.5px] border-dashed text-[color:var(--ink-soft)] transition-colors hover:border-[color:var(--emphasis)] hover:text-[color:var(--emphasis)]"
            style={{ aspectRatio: String(slideAspect), borderColor: "var(--hairline)" }}
          >
            <PlusIcon className="size-6" />
          </button>
        </div>
      </SortableContext>
    </DndContext>
  ) : (
    <div className="grid grid-cols-3 content-start gap-2.5">
      {liveItems.map((item, i) => (
        <PageItemCard
          key={item.id}
          item={item}
          pageNumber={i + 1}
          bytes={sourceBytesById.get(item.sourceFileId)}
          tint={NEUTRAL_TINT}
          frameBg="var(--surface-2)"
          pageAspect={slideAspect}
          fluid
          draggable={false}
        />
      ))}
    </div>
  );

  // What the zoom enlarges: the picture, or the colour at its picture's size.
  const zoomSrc =
    shownBg.kind === "image"
      ? shownBg.url
      : shownBg.kind === "color"
        ? { colour: shownBg.color, size: ((d) => ({ w: d.width, h: d.height }))(filledSize(slide, screen)) }
        : null;

  // The slide settings: ratio, screen, alignment and background in one 2×2
  // block with the labels beside the tabs, the preview taking all the height
  // left, then the placement fields.
  const settings = (
    <>
      <div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-1.5">
        <SlideAspectSelector value={slideKind} onChange={setSlideKind} labels={labels} />
        <ScreenSizeSelector value={screen} onChange={setScreen} labels={labels} />
        <AlignSelector value={align} onChange={setAlign} labels={labels} />
        <BackgroundRow background={shownBg} ratio={slideAspect} onChange={openBgEditor} labels={labels} />
      </div>
      <PlacementEditor
        box={box}
        onBoxChange={setBox}
        slideW={slide.w}
        slideH={slide.h}
        background={shownBg}
        refImageUrl={refImageUrl}
        handleLabels={labels.resizeHandles}
        align={align}
        zoom={shownBg.kind === "empty" ? undefined : { label: labels.zoom.zoom, onZoom: () => setZoomed(true) }}
      />
      <PlacementControls
        box={box}
        onBoxChange={setBox}
        slideW={slide.w}
        slideH={slide.h}
        refSize={ref}
        labels={labels}
      />
    </>
  );

  // Two equal halves with a 1 px divider (ppt-background canon): the slide
  // pictures left; the settings, the progress or the result right. The tray
  // height lives here, so nothing in it scrolls but the picture grid.
  const workspace = (
    <div
      className="grid"
      style={{
        height: "var(--tray-h)",
        gridTemplateColumns: "minmax(0, 1fr) 1px minmax(0, 1fr)",
      }}
    >
      <div className="relative min-h-0">
        {/* The slide pictures, or the background editor after "바꾸기". */}
        <div className={`ob-scroll h-full overflow-y-auto pr-5 ${showEditor ? "hidden" : ""}`}>{pictures}</div>
        {editorMounted && (
          <div className={`h-full min-h-0 flex-col gap-2 pr-5 ${showEditor ? "flex" : "hidden"}`}>
            {/* image-to-pptx's own bar over the shared editor. */}
            <div className="flex shrink-0 items-center justify-between gap-2">
              <p className="font-mono text-[11px]" style={{ color: "var(--ink-soft)" }}>
                {labels.bgLabel}
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={cancelBgEditor}
                  className="subtle-action rounded-[5px] px-2.5 py-1.5 font-body text-[11px]"
                >
                  {labels.bgCancel}
                </button>
                <button
                  type="button"
                  onClick={finishBgEditor}
                  // A pick still on its way (a download, a HEIC conversion) is not a background yet.
                  disabled={!bgReady}
                  className="subtle-action rounded-[5px] px-2.5 py-1.5 font-body text-[11px]"
                >
                  {labels.bgDone}
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <BackgroundEditor
                editor={editor}
                locked={status !== "idle"}
                // A new deck has no theme background for "no background" to mean.
                noneColour={null}
                labels={labels.editor}
              />
            </div>
          </div>
        )}
      </div>
      <div style={{ background: "var(--border)" }} />
      <div className="relative flex min-h-0 flex-col gap-2.5 pl-5">
        {status === "idle" ? (
          settings
        ) : status === "done" && result ? (
          <ImageToPptxResult result={result} labels={labels} onDownload={download} />
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
        {zoomed && status === "idle" && zoomSrc && (
          <PreviewLightbox
            src={zoomSrc}
            alt={labels.bgLabel}
            aspect={String(slideAspect)}
            crop={shownBg.kind === "image" ? shownBg.crop : null}
            sourceSize={shownBg.kind === "image" ? shownBg.sourceSize : undefined}
            live={shownBg.kind === "image" ? editLive : null}
            finished={filterPreview}
            busyLabel={editPending || actualPending ? labels.editor.recipeEdit.drawing : null}
            closeLabel={labels.zoom.close}
            fullscreenLabels={{ enter: labels.zoom.fullscreen, exit: labels.zoom.exitFullscreen }}
            onFullscreenChange={setZoomFullscreen}
            actual={actualUrl}
            onClose={() => setZoomed(false)}
            overlay={
              refImageUrl ? (
                <div className="absolute" style={boxStyle(box, slide.w, slide.h)}>
                  <PlacedPicture url={refImageUrl} align={align} />
                </div>
              ) : null
            }
          />
        )}
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
      executeLabel={template(labels.convertTemplate, { n: liveItems.length })}
      processingLabel={labels.processing}
      againLabel={labels.again}
      // The deck is made with the background as picked: the editor closes on it.
      onExecute={() => {
        if (editingBg) finishBgEditor();
        // The zoomed preview covers the right half, where the run's status and result show.
        setZoomed(false);
        run();
      }}
      onAgain={handleAgain}
      executeDisabled={liveItems.length === 0 || !bgReady}
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
          maxSize={uploadLimitFor("image-to-pptx")}
          busy={loadingPages}
          onFiles={handleUpload}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={{ ...labels.fileUpload, maxSize: labels.uploadMaxSize }}
        />
      ) : (
        <>
          {showOversize && (
            <OversizeNotice
              totalBytes={totalBytes}
              warning={labels.fileUpload.oversizeWarning}
              dismissLabel={labels.fileUpload.dismiss}
              onDismiss={() => setOversizeDismissed(true)}
            />
          )}
          {workspace}
        </>
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
