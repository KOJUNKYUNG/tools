"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ToolHeader } from "@/components/common/ToolHeader";
import { FileUpload } from "@/components/common/FileUpload";
import { EMBEDDED_ASSET_LIMIT, uploadLimitFor } from "@/lib/constants";
import { formatBytes } from "@/lib/common/formatBytes";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { changeBackground, type BgMode } from "@/lib/ppt/changeBackground";
import {
  extractCurrentBackgrounds,
  type SlideBackground,
} from "@/lib/ppt/extractCurrentBackgrounds";
import { getSlideAspect, type SlideAspect } from "@/lib/ppt/getSlideAspect";
import { groupBackgrounds, type BackgroundGroup } from "@/lib/ppt/groupBackgrounds";
import { PageRangeSelector } from "@/components/common/PageRangeSelector";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { template } from "@/lib/common/template";
import { getErrorMessage } from "@/lib/errors";
import { normalizeImageFile } from "@/lib/image/heic";
import type { CropRect } from "@/lib/image/maxFitCrop";
import { belowFullHd } from "@/lib/image/slideImage";
import type { GalleryImage, GalleryCategory } from "@/lib/gallery/types";
import type { Dictionary } from "@/i18n/config";
import { ModeSelector } from "./ModeSelector";
import { BackgroundPicker } from "./BackgroundPicker";
import { SelectedBackgroundFrame } from "./SelectedBackgroundFrame";
import { CurrentBackgroundFrame } from "./CurrentBackgroundFrame";
import { PreviewLightbox } from "@/components/common/PreviewLightbox";
import { PptBackgroundResult } from "./PptBackgroundResult";
import { PptConversionGuide, type ConversionMethodLabels } from "./PptConversionGuide";

const PPTX_ACCEPT = {
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.ms-powerpoint": [".ppt"],
};

/**
 * Draw an SVG gallery image (the gradients) once at its own size into a
 * lossless PNG: PowerPoint handles SVG backgrounds inconsistently, and the
 * preparer needs pixels. The preparer then picks its format like any upload.
 */
async function rasterizeSvg(image: GalleryImage): Promise<File> {
  return new Promise<File>((resolve, reject) => {
    const img = new globalThis.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || image.width;
      canvas.height = img.naturalHeight || image.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Canvas toBlob returned null"));
          return;
        }
        resolve(new File([blob], `gallery-${image.id}.png`, { type: "image/png" }));
      }, "image/png");
    };
    img.onerror = () => reject(new Error("Failed to load gallery image"));
    img.src = image.url;
  });
}

/**
 * A gallery image as the file the preparer starts from. A raster image
 * (picsum's photos) is fetched in its own format, so a photo stays a small
 * JPEG instead of being turned into a large PNG first; only an SVG is drawn.
 */
async function galleryImageFile(image: GalleryImage): Promise<File> {
  if (image.url.startsWith("data:image/svg+xml")) return rasterizeSvg(image);
  const response = await fetch(image.url);
  if (!response.ok) throw new Error(`Failed to load gallery image (${response.status})`);
  const blob = await response.blob();
  const ext = blob.type === "image/png" ? "png" : "jpg";
  return new File([blob], `gallery-${image.id}.${ext}`, { type: blob.type });
}

export interface PptBackgroundToolLabels {
  /** Shared error copy (`common.errors`), in the page's language. */
  errors: Dictionary["common"]["errors"];
  header: { title: string; description: string };
  upload: { dropzoneLabel: string; dropzoneHint: string };
  conversion: { heading: string; note: string; methods: ConversionMethodLabels[] };
  fileStatus: { slideCountTemplate: string; changeFile: string; analyzing: string };
  mode: {
    label: string;
    optionAll: string;
    optionMaster: string;
    optionSpecific: string;
    masterNote: string;
    specificInput: string;
    specificSelectAll: string;
    specificClear: string;
    specificHint: string;
  };
  thumbnails: {
    heading: string;
    empty: string;
    sourceByKey: Record<"slide" | "layout" | "master", string>;
  };
  background: {
    heading: string;
    preview: string;
    empty: string;
    fromGallery: string;
    fromUpload: string;
    clear: string;
    uploadLabel: string;
    uploadHint: string;
    sourceUpload: string;
    sourceGallery: string;
    tooLarge: string;
    backToGallery: string;
    blurNotice: string;
  };
  gallery: {
    heading: string;
    countSuffixTemplate: string;
    categoryAll: string;
    categoryByKey: Record<GalleryCategory, string>;
    empty: string;
  };
  action: {
    apply: string;
    applyDisabledHint: string;
    specificEmpty: string;
  };
  processing: {
    processing: string;
    done: string;
    doneBody: string;
    download: string;
    error: string;
    /** Shown when the output check blocks a broken deck. */
    errorCorrupt: string;
    retry: string;
    tryAnother: string;
  };
  preview: {
    selectedCaption: string;
    currentCaptionTemplate: string;
    selectedEmpty: string;
    currentEmpty: string;
    /** Under a covering-background group: its picture is deleted on apply. */
    coveringMarker: string;
    slideCountTemplate: string;
    zoom: string;
    close: string;
  };
  fileUpload: Dictionary["common"]["fileUpload"];
  resizeHandles: Dictionary["common"]["resizeHandles"];
}

interface PptBackgroundToolProps {
  labels: PptBackgroundToolLabels;
  /**
   * When true, the tool renders without its outer card chrome (border,
   * shadow, glass surface) and without the internal header strip. Use this
   * when mounting inside a surface that already provides the chrome
   * (e.g. Screen3Workspace's inline card). Default: false.
   */
  inline?: boolean;
}

export function PptBackgroundTool({ labels, inline = false }: PptBackgroundToolProps) {
  const [showConversionGuide, setShowConversionGuide] = useState(false);
  // Controlled accordion state — when the guide expands it covers the
  // dropzone, so the parent has to own this to drive the layout.
  const [guideOpen, setGuideOpen] = useState(false);
  const [bgFiles, setBgFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<BgMode>("all-slides");
  const [galleryImage, setGalleryImage] = useState<GalleryImage | null>(null);
  const [currentBgs, setCurrentBgs] = useState<SlideBackground[]>([]);
  const [bgPreviewUrl, setBgPreviewUrl] = useState<string | null>(null);
  /** A picked HEIC is being converted; the upload button waits. */
  const [normalizing, setNormalizing] = useState(false);
  /** The Background crop the frame holds, in the picture's upright pixels. */
  const [crop, setCrop] = useState<CropRect | null>(null);
  /** The left pane shows the frame over the picked picture instead of the gallery. */
  const [framing, setFraming] = useState(false);

  // Redesigned workspace state.
  const [slideAspect, setSlideAspect] = useState<SlideAspect>({
    kind: "16:9",
    ratio: 16 / 9,
  });
  const [groups, setGroups] = useState<BackgroundGroup[]>([]);
  const [groupThumbUrls, setGroupThumbUrls] = useState<Map<string, string>>(new Map());
  const [curIndex, setCurIndex] = useState(0);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [selectedSlides, setSelectedSlides] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState<null | "selected" | "current">(null);

  const aspectCss =
    slideAspect.kind === "4:3"
      ? "4 / 3"
      : slideAspect.kind === "16:9"
        ? "16 / 9"
        : `${slideAspect.ratio}`;

  const bgFile = bgFiles[0] ?? null;
  const groupThumbUrlsRef = useRef(groupThumbUrls);
  groupThumbUrlsRef.current = groupThumbUrls;
  // Mirror bgPreviewUrl into a ref so the unmount cleanup (which has an empty
  // dep array) revokes the LATEST uploaded blob URL, not the mount-time null.
  const bgPreviewUrlRef = useRef(bgPreviewUrl);
  bgPreviewUrlRef.current = bgPreviewUrl;
  // Each background pick takes a number; a slow pick (a gallery download, a
  // HEIC conversion) that finishes after a newer pick or a reset is dropped.
  const pickRef = useRef(0);

  const {
    files: pptxFiles,
    setFiles: setPptxFilesRaw,
    status,
    progress,
    errorMessage,
    run,
    retry,
    download,
  } = useToolProcessor<Uint8Array>({
    processor: (files, onProgress) =>
      changeBackground({
        pptxFile: files[0],
        bgImage: bgFile!,
        mode,
        targetSlides:
          mode === "specific-slides"
            ? [...selectedSlides].sort((a, b) => a - b)
            : undefined,
        crop: crop ?? undefined,
        onProgress,
      }),
    onDownload: (bytes) => {
      const baseName = pptxFiles[0]?.name.replace(/\.pptx?$/i, "") ?? "presentation";
      downloadBlob(
        bytes,
        `${baseName}-bg-changed.pptx`,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      );
    },
    errorOptions: { copy: labels.errors, corruptOutputHint: labels.processing.errorCorrupt },
  });

  const pptxFile = pptxFiles[0] ?? null;

  /** Show `url` as the selected background, releasing the previous blob URL. */
  const showPreview = useCallback((url: string | null) => {
    const prev = bgPreviewUrlRef.current;
    if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
    bgPreviewUrlRef.current = url;
    setBgPreviewUrl(url);
  }, []);

  /** Drop the background pick, including one still downloading or converting. */
  const clearPick = useCallback(() => {
    pickRef.current++;
    setNormalizing(false);
    setBgFiles([]);
    setGalleryImage(null);
    showPreview(null);
    setCrop(null);
    setFraming(false);
  }, [showPreview]);

  // .ppt vs .pptx routing — .ppt never enters useToolProcessor state.
  const setPptxFiles = useCallback(
    (files: File[]) => {
      const first = files[0];
      if (first && first.name.toLowerCase().endsWith(".ppt")) {
        setShowConversionGuide(true);
        setPptxFilesRaw([]);
        return;
      }
      // Successful .pptx — reset the guide visibility/open state so a future
      // .ppt drop starts collapsed again, AND reset the whole workspace to its
      // just-entered state: a re-upload must not carry over the previous
      // background pick, apply-scope, range, zoom, or done/error status.
      setShowConversionGuide(false);
      setGuideOpen(false);
      retry();
      clearPick();
      setMode("all-slides");
      setCheckedKeys(new Set());
      setSelectedSlides(new Set());
      setZoom(null);
      setPptxFilesRaw(files);
    },
    [setPptxFilesRaw, retry, clearPick],
  );

  const openPptxFileDialog = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      ".ppt,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint";
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        setPptxFiles(Array.from(target.files));
      }
    };
    input.click();
  }, [setPptxFiles]);

  // Extract current backgrounds + slide aspect when a .pptx is loaded.
  useEffect(() => {
    if (!pptxFile) {
      setCurrentBgs([]);
      setGroups([]);
      groupThumbUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      setGroupThumbUrls(new Map());
      setCurIndex(0);
      setCheckedKeys(new Set());
      setSelectedSlides(new Set());
      return;
    }
    setCurIndex(0);
    setCheckedKeys(new Set());
    setSelectedSlides(new Set());
    let cancelled = false;

    getSlideAspect(pptxFile).then((a) => {
      if (!cancelled) setSlideAspect(a);
    });

    extractCurrentBackgrounds(pptxFile)
      .then((bgs) => {
        if (cancelled) return;
        setCurrentBgs(bgs);
        const grouped = groupBackgrounds(bgs);
        setGroups(grouped);
        const urls = new Map<string, string>();
        for (const grp of grouped) {
          if (grp.imageBlob) urls.set(grp.key, URL.createObjectURL(grp.imageBlob));
        }
        groupThumbUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        setGroupThumbUrls(urls);
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentBgs([]);
          setGroups([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pptxFile]);

  // Cleanup all object URLs on unmount.
  useEffect(() => {
    return () => {
      groupThumbUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      const preview = bgPreviewUrlRef.current;
      if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, []);

  const handleGallerySelect = useCallback(
    async (image: GalleryImage) => {
      // The picture already picked: back to its frame, framing kept.
      if (image.id === galleryImage?.id && bgFile) {
        setFraming(true);
        return;
      }
      const pick = ++pickRef.current;
      // A HEIC still converting is dropped, so its busy state goes too.
      setNormalizing(false);
      setGalleryImage(image);
      // Until the picture arrives nothing can be framed or applied: the old
      // picture and its frame must not meet the new thumbnail.
      setBgFiles([]);
      setCrop(null);
      setFraming(false);
      showPreview(image.thumbnailUrl);
      try {
        const file = await galleryImageFile(image);
        if (pick !== pickRef.current) return;
        setBgFiles([file]);
        // The frame and the preview work on the full picture, not the thumbnail.
        showPreview(URL.createObjectURL(file));
        setFraming(true);
      } catch {
        if (pick !== pickRef.current) return;
        setGalleryImage(null);
        showPreview(null);
      }
    },
    [showPreview, galleryImage?.id, bgFile],
  );

  const handleDirectUpload = useCallback(
    async (files: File[]) => {
      const picked = files[0];
      if (!picked) return;
      // The background is embedded into the deck, so it bypasses the .pptx
      // UPLOAD_LIMIT and gets its own (tighter) ceiling, checked on the file
      // as picked (before HEIC conversion).
      if (picked.size > EMBEDDED_ASSET_LIMIT) {
        toast.error(
          template(labels.background.tooLarge, {
            size: formatBytes(EMBEDDED_ASSET_LIMIT),
          }),
        );
        return;
      }
      const pick = ++pickRef.current;
      let file: File;
      setNormalizing(true);
      try {
        // HEIC/HEIF (iPhone photos) → JPEG; PNG and JPEG pass through.
        file = await normalizeImageFile(picked);
      } catch (err) {
        if (pick === pickRef.current) {
          toast.error(
            getErrorMessage(err, {
              copy: labels.errors,
              fallbackMessage: labels.errors.heicConvertFailed,
            }).message,
          );
        }
        return;
      } finally {
        if (pick === pickRef.current) setNormalizing(false);
      }
      if (pick !== pickRef.current) return;
      setBgFiles([file]);
      setGalleryImage(null);
      setCrop(null);
      showPreview(URL.createObjectURL(file));
      setFraming(true);
    },
    [labels.background.tooLarge, labels.errors, showPreview],
  );

  const totalSlides = currentBgs.length;
  const canRun =
    !!pptxFile &&
    !!bgFile &&
    (mode !== "specific-slides" || selectedSlides.size > 0) &&
    // A HEIC still converting would replace the picture under the run.
    !normalizing &&
    status === "idle";

  // ───────── Bidirectional check ↔ range binding ─────────
  // Checking a current-background group selects every slide that uses it and
  // switches the scope to "선택"; the PageRangeSelector then shows that range
  // (normalised) and can be edited freely.
  const onToggleCheck = useCallback(
    (key: string) => {
      const nextChecked = new Set(checkedKeys);
      if (nextChecked.has(key)) nextChecked.delete(key);
      else nextChecked.add(key);
      const union = new Set<number>();
      for (const g of groups) {
        if (nextChecked.has(g.key)) for (const i of g.slideIndexes) union.add(i);
      }
      setMode("specific-slides");
      setCheckedKeys(nextChecked);
      setSelectedSlides(union);
    },
    [checkedKeys, groups],
  );

  // Editing the range directly (typing, 전체, 초기화) detaches it from the
  // current-background checkboxes.
  const onRangeChange = useCallback((next: Set<number>) => {
    setSelectedSlides(next);
    setCheckedKeys(new Set());
  }, []);

  const onModeChange = useCallback((next: BgMode) => {
    setMode(next);
    if (next !== "specific-slides") {
      setCheckedKeys(new Set());
      setSelectedSlides(new Set());
    }
  }, []);

  // Back to the settings with everything kept, the picture and its frame
  // included: the user may only want to frame it again.
  const handleTryAnother = useCallback(() => {
    retry();
    setFraming(true);
  }, [retry]);

  // Zoom source URL: selected-bg preview or the current group's thumb.
  const currentGroup = groups[curIndex];
  const currentThumbUrl = currentGroup ? groupThumbUrls.get(currentGroup.key) ?? null : null;
  const zoomSrc = zoom === "selected" ? bgPreviewUrl : zoom === "current" ? currentThumbUrl : null;

  // When the .ppt rejection guide is showing, give the empty-state body itself
  // a definite 50vh height so its flex-1 children (the accordion in particular)
  // have something to flex against — without a definite height the accordion's
  // scroll never engages and content bleeds past the panel bottom. The tray
  // height lives on the body container, not the outer card, so the card is
  // `header + 50vh` (canon = pdf-watermark), never `50vh` clipping the header.
  const lockHeight = showConversionGuide && !pptxFile;

  const header = (
    <ToolHeader
      title={labels.header.title}
      description={labels.header.description}
      hasFile={!!pptxFile}
      fileSummary={pptxFile?.name}
      meta={
        pptxFile ? (
          <span className="shrink-0 font-body text-[12px]" style={{ color: "var(--ink-soft)" }}>
            {`· ${formatBytes(pptxFile.size)}`}
            {totalSlides > 0
              ? ` · ${template(labels.fileStatus.slideCountTemplate, { n: totalSlides })}`
              : ` · ${labels.fileStatus.analyzing}`}
          </span>
        ) : undefined
      }
      status={status}
      onReupload={openPptxFileDialog}
      reuploadLabel={labels.fileStatus.changeFile}
      busy={status === "processing"}
      executeLabel={labels.action.apply}
      processingLabel={labels.processing.processing}
      againLabel={labels.processing.tryAnother}
      onExecute={run}
      onAgain={handleTryAnother}
      executeDisabled={!canRun}
    />
  );

  // ───────── Render ─────────
  return (
    <div
      className={
        inline
          ? "relative flex h-full flex-col"
          : "relative flex flex-col overflow-hidden rounded-[14px] border"
      }
      style={
        inline
          ? undefined
          : {
              background: "var(--surface)",
              borderColor: "var(--border)",
              boxShadow: "var(--shadow-lg)",
            }
      }
    >
      <div
        className="mb-2 border-b px-6 pb-1 pt-3"
        style={{ borderColor: "var(--border)" }}
      >
        {header}
      </div>

      {/* Body */}
      {!pptxFile ? (
        // Empty state — natural-size dropzone normally (matches the other
        // tools). When a .ppt is rejected, THIS body is pinned to 50vh (see
        // lockHeight) and its flex-1 children fill that space, so the
        // accordion's expanded body scrolls within the panel instead of
        // bleeding past it. Collapsed and expanded states share the same
        // vertical footprint by construction.
        <div
          className={
            lockHeight
              ? "flex min-h-0 flex-1 flex-col gap-4 px-6 py-4"
              : "flex flex-col gap-4 px-6 py-4"
          }
          style={lockHeight ? { height: "var(--tray-h)" } : undefined}
        >
          {showConversionGuide && (
            <PptConversionGuide
              heading={labels.conversion.heading}
              methods={labels.conversion.methods}
              note={labels.conversion.note}
              open={guideOpen}
              onOpenChange={setGuideOpen}
              className={guideOpen ? "min-h-0 flex-1" : "shrink-0"}
            />
          )}
          {!guideOpen && (
            <FileUpload
              accept={PPTX_ACCEPT}
              multiple={false}
              maxSize={uploadLimitFor("ppt-background")}
              onFiles={setPptxFiles}
              label={labels.upload.dropzoneLabel}
              description={labels.upload.dropzoneHint}
              hideFileList
              labels={labels.fileUpload}
            />
          )}
        </div>
      ) : (
        // Loaded workspace — the tray height lives HERE (not the outer card),
        // so the card is `header + 50vh` and the gallery scrolls inside its
        // pane. Switching category tabs must never resize the tool (UI
        // stability contract). Canon = pdf-watermark. The panes stay side by
        // side at every width: stacked, they outgrow the tray, and the landing
        // workspace does not scroll.
        <div className="flex flex-col gap-3" style={{ height: "var(--tray-h)" }}>

          {/* Two-pane workspace. */}
          <div
            className="grid min-h-0 flex-1"
            style={{ gridTemplateColumns: "minmax(0, 1fr) 1px minmax(0, 1fr)" }}
          >
            {/* LEFT panel — gallery, or the frame over the picked picture */}
            <div className="flex h-full min-h-0 flex-col px-6 py-3">
              <BackgroundPicker
                galleryImage={galleryImage}
                onGallerySelect={handleGallerySelect}
                onDirectUpload={handleDirectUpload}
                uploadBusy={normalizing}
                // While a run uses the picture (running, done or failed) its
                // frame is shown locked; `다시 하기` goes back to edit it.
                frame={
                  (framing || status !== "idle") && bgPreviewUrl
                    ? {
                        imageUrl: bgPreviewUrl,
                        ratio: slideAspect.ratio,
                        crop,
                        onCropChange: setCrop,
                        onBack: () => setFraming(false),
                        locked: status !== "idle",
                      }
                    : null
                }
                labels={{
                  uploadLabel: labels.background.uploadLabel,
                  backToGallery: labels.background.backToGallery,
                  pictureAlt: labels.preview.selectedCaption,
                  handles: labels.resizeHandles,
                  gallery: labels.gallery,
                }}
              />
            </div>

            {/* Divider */}
            <div style={{ background: "var(--hairline)" }} />

            {/* RIGHT panel */}
            <div className="relative flex h-full min-h-0 flex-col px-6 py-3">
              {status === "idle" ? (
                <>
                  <div className="flex items-start gap-3.5">
                    <SelectedBackgroundFrame
                      caption={labels.preview.selectedCaption}
                      previewUrl={bgPreviewUrl}
                      aspect={aspectCss}
                      emptyLabel={labels.preview.selectedEmpty}
                      zoomLabel={labels.preview.zoom}
                      onZoom={() => setZoom("selected")}
                      crop={crop}
                      onSelect={bgFile && !framing ? () => setFraming(true) : undefined}
                    />
                    <CurrentBackgroundFrame
                      caption={template(labels.preview.currentCaptionTemplate, {
                        n: groups.length,
                      })}
                      groups={groups}
                      thumbUrls={groupThumbUrls}
                      index={curIndex}
                      onIndex={setCurIndex}
                      checkedKeys={checkedKeys}
                      onToggleCheck={onToggleCheck}
                      aspect={aspectCss}
                      slideCountTemplate={labels.preview.slideCountTemplate}
                      emptyLabel={labels.preview.currentEmpty}
                      coveringLabel={labels.preview.coveringMarker}
                      zoomLabel={labels.preview.zoom}
                      onZoom={() => setZoom("current")}
                    />
                  </div>

                  {/* Blur notice: its two lines are always reserved, so it
                      appears and goes without moving anything. */}
                  <p
                    className="mt-2 line-clamp-2 min-h-[2.7em] font-body text-[10.5px] leading-[1.35]"
                    style={{
                      color: "var(--ink-soft)",
                      visibility: crop && belowFullHd(crop, { w: slideAspect.ratio, h: 1 }) ? "visible" : "hidden",
                    }}
                  >
                    {labels.background.blurNotice}
                  </p>

                  {/* Apply-scope block, pinned to bottom */}
                  <div className="mt-auto pt-2">
                    <div
                      className="mb-2 flex items-center gap-2.5"
                      style={{ minHeight: "32px" }}
                    >
                      <div
                        className="shrink-0 font-mono text-[11px] font-medium uppercase tracking-[0.08em]"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {labels.mode.label}
                      </div>
                      <div className="min-w-0 flex-1">
                        {mode === "specific-slides" && (
                          <PageRangeSelector
                            totalPages={totalSlides}
                            selected={selectedSlides}
                            onChange={onRangeChange}
                            inputPlaceholder={labels.mode.specificInput}
                            selectAllLabel={labels.mode.specificSelectAll}
                            clearLabel={labels.mode.specificClear}
                          />
                        )}
                        {mode === "master" && (
                          <p
                            className="line-clamp-2 font-body text-[10.5px] leading-[1.35]"
                            style={{ color: "var(--ink-soft)" }}
                            title={labels.mode.masterNote}
                          >
                            {labels.mode.masterNote}
                          </p>
                        )}
                        {mode === "all-slides" && <span>&nbsp;</span>}
                      </div>
                    </div>
                    <ModeSelector
                      value={mode}
                      onChange={onModeChange}
                      labels={{
                        optionAll: labels.mode.optionAll,
                        optionMaster: labels.mode.optionMaster,
                        optionSpecific: labels.mode.optionSpecific,
                      }}
                    />
                  </div>
                </>
              ) : status === "done" ? (
                <PptBackgroundResult
                  title={labels.processing.done}
                  downloadLabel={labels.processing.download}
                  onDownload={download}
                />
              ) : (
                <ProcessingStatus
                  status={status}
                  progress={progress}
                  errorMessage={errorMessage}
                  onRetry={retry}
                  labels={labels.processing}
                />
              )}

              {zoom !== null && zoomSrc && (
                <PreviewLightbox
                  src={zoomSrc}
                  alt={
                    zoom === "selected"
                      ? labels.preview.selectedCaption
                      : template(labels.preview.currentCaptionTemplate, { n: groups.length })
                  }
                  aspect={aspectCss}
                  crop={zoom === "selected" ? crop : null}
                  closeLabel={labels.preview.close}
                  onClose={() => setZoom(null)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
