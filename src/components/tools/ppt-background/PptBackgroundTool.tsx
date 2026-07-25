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
import type { GalleryImage, GalleryCategory } from "@/lib/gallery/types";
import type { Dictionary } from "@/i18n/config";
import { ModeSelector } from "./ModeSelector";
import { BackgroundPicker } from "./BackgroundPicker";
import { SelectedBackgroundFrame } from "./SelectedBackgroundFrame";
import { CurrentBackgroundFrame } from "./CurrentBackgroundFrame";
import { PreviewLightbox } from "./PreviewLightbox";
import { PptBackgroundResult } from "./PptBackgroundResult";
import { PptConversionGuide, type ConversionMethodLabels } from "./PptConversionGuide";

const PPTX_ACCEPT = {
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.ms-powerpoint": [".ppt"],
};

/**
 * Load a gallery image (any URL the browser can decode — picsum JPEG, SVG data
 * URL, etc.) and convert it to a PNG File via Canvas. This gives the
 * downstream PPTX writer a single, predictable input (raster PNG bytes with a
 * correct MIME label) and avoids embedding SVG into PPTX backgrounds, which
 * PowerPoint handles inconsistently.
 */
async function galleryImageToPngFile(url: string, id: string): Promise<File> {
  return new Promise<File>((resolve, reject) => {
    const img = new globalThis.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const w = img.naturalWidth || 1920;
      const h = img.naturalHeight || 1080;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas toBlob returned null"));
            return;
          }
          resolve(new File([blob], `gallery-${id}.png`, { type: "image/png" }));
        },
        "image/png",
      );
    };
    img.onerror = () => reject(new Error("Failed to load gallery image"));
    img.src = url;
  });
}

export interface PptBackgroundToolLabels {
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
    errorBody: string;
    retry: string;
    tryAnother: string;
  };
  preview: {
    selectedCaption: string;
    currentCaptionTemplate: string;
    selectedEmpty: string;
    currentEmpty: string;
    slideCountTemplate: string;
    zoom: string;
    close: string;
  };
  fileUpload: Dictionary["common"]["fileUpload"];
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
  });

  const pptxFile = pptxFiles[0] ?? null;

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
      setBgFiles([]);
      setGalleryImage(null);
      const prevPreview = bgPreviewUrlRef.current;
      if (prevPreview && prevPreview.startsWith("blob:")) URL.revokeObjectURL(prevPreview);
      setBgPreviewUrl(null);
      setMode("all-slides");
      setCheckedKeys(new Set());
      setSelectedSlides(new Set());
      setZoom(null);
      setPptxFilesRaw(files);
    },
    [setPptxFilesRaw, retry],
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

  // When the user picks a new background after a completed run, drop the
  // Done box and let them Apply again with the new background.
  useEffect(() => {
    if (status === "done") retry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgFiles, galleryImage?.id]);

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
      setGalleryImage(image);
      if (bgPreviewUrl && bgPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(bgPreviewUrl);
      setBgPreviewUrl(image.thumbnailUrl);
      try {
        const file = await galleryImageToPngFile(image.url, image.id);
        setBgFiles([file]);
      } catch {
        setGalleryImage(null);
        if (bgPreviewUrl && bgPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(bgPreviewUrl);
        setBgPreviewUrl(null);
      }
    },
    [bgPreviewUrl],
  );

  const handleDirectUpload = useCallback(
    (files: File[]) => {
      // The background is embedded into the deck, so it bypasses the .pptx
      // UPLOAD_LIMIT and gets its own (tighter) ceiling.
      const oversize = files.find((f) => f.size > EMBEDDED_ASSET_LIMIT);
      if (oversize) {
        toast.error(
          template(labels.background.tooLarge, {
            size: formatBytes(EMBEDDED_ASSET_LIMIT),
          }),
        );
        return;
      }
      setBgFiles(files);
      setGalleryImage(null);
      if (bgPreviewUrl && bgPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(bgPreviewUrl);
      setBgPreviewUrl(files[0] ? URL.createObjectURL(files[0]) : null);
    },
    [bgPreviewUrl, labels.background.tooLarge],
  );

  const totalSlides = currentBgs.length;
  const canRun =
    !!pptxFile &&
    !!bgFile &&
    (mode !== "specific-slides" || selectedSlides.size > 0) &&
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

  const handleTryAnother = useCallback(() => {
    retry();
    setBgFiles([]);
    setGalleryImage(null);
    if (bgPreviewUrl && bgPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(bgPreviewUrl);
    setBgPreviewUrl(null);
    // Keep pptxFile, currentBgs, groups, groupThumbUrls, mode, selectedSlides.
  }, [retry, bgPreviewUrl]);

  // Zoom source URL: selected-bg preview or the current group's thumb.
  const currentGroup = groups[curIndex];
  const currentThumbUrl = currentGroup ? groupThumbUrls.get(currentGroup.key) ?? null : null;
  const zoomSrc = zoom === "selected" ? bgPreviewUrl : zoom === "current" ? currentThumbUrl : null;

  // When the .ppt rejection guide is showing, lock the outer panel to its
  // full 50vh so the body's flex-1 children (the accordion in particular)
  // have a definite height to flex against — without this the outer is
  // content-sized and flex-1 has nothing to grow into, so the accordion's
  // scroll never engages and content bleeds past the panel bottom.
  const lockHeight = showConversionGuide && !pptxFile;
  // Once a deck is loaded, pin the workspace to the tray height so the gallery
  // scrolls INSIDE its pane — switching category tabs (different image counts)
  // must never resize the tool (UI stability contract).
  const fixedHeight = lockHeight || !!pptxFile;

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
          ? { maxHeight: "var(--tray-h)", ...(fixedHeight ? { height: "var(--tray-h)" } : {}) }
          : {
              background: "var(--surface)",
              borderColor: "var(--border)",
              boxShadow: "var(--shadow-lg)",
              maxHeight: "var(--tray-h)",
              ...(fixedHeight ? { height: "var(--tray-h)" } : {}),
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
        // tools). When a .ppt is rejected, the outer panel is locked to
        // 50vh above (see lockHeight) and this body uses flex-1 to fill
        // that space, so the accordion's expanded body scrolls within the
        // panel instead of bleeding past it. Collapsed and expanded states
        // share the same vertical footprint by construction.
        <div
          className={
            lockHeight
              ? "flex min-h-0 flex-1 flex-col gap-4 px-6 py-4"
              : "flex flex-col gap-4 px-6 py-4"
          }
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
        <div className="flex min-h-0 flex-1 flex-col gap-3">

          {/* Two-pane workspace. */}
          <div
            className="grid min-h-0 flex-1"
            style={{ gridTemplateColumns: "minmax(0, 1fr) 1px minmax(0, 1fr)" }}
          >
            {/* LEFT panel — gallery only */}
            <div className="flex h-full min-h-0 flex-col px-6 py-3">
              <BackgroundPicker
                galleryImage={galleryImage}
                onGallerySelect={handleGallerySelect}
                onDirectUpload={handleDirectUpload}
                labels={{
                  uploadLabel: labels.background.uploadLabel,
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
                      zoomLabel={labels.preview.zoom}
                      onZoom={() => setZoom("current")}
                    />
                  </div>

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
