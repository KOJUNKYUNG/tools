"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ToolHeader } from "@/components/common/ToolHeader";
import { FileUpload } from "@/components/common/FileUpload";
import { uploadLimitFor } from "@/lib/constants";
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
import { maxFitCrop } from "@/lib/image/maxFitCrop";
import { belowFullHd, filledSize, slideImagePreparer, type SlideSize } from "@/lib/image/slideImage";
import { bakesPicture, filteredColour } from "@/lib/image/filterSet";
import { filterStep } from "@/lib/image/filterCanvas";
import { drawRecipeFile } from "@/lib/gallery/drawRecipe";
import { solidPictureFile } from "@/lib/background/backgroundFiles";
import type { Dictionary } from "@/i18n/config";
import { ModeSelector } from "./ModeSelector";
import { SelectedBackgroundFrame } from "./SelectedBackgroundFrame";
import { CurrentBackgroundFrame } from "./CurrentBackgroundFrame";
import { PreviewLightbox } from "@/components/common/PreviewLightbox";
import { PptBackgroundResult } from "./PptBackgroundResult";
import { PptConversionGuide, type ConversionMethodLabels } from "./PptConversionGuide";
import { themeBackground } from "@/lib/ppt/themeBackground";
import { useBackgroundEditor } from "@/components/background-editor/useBackgroundEditor";
import { BackgroundEditor, type BackgroundEditorLabels } from "@/components/background-editor/BackgroundEditor";
import type { RecipeEditLabels } from "@/components/background-editor/RecipeEditControls";
import type { SolidColourLabels } from "@/components/background-editor/SolidColourGrid";

const PPTX_ACCEPT = {
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.ms-powerpoint": [".ppt"],
};

/**
 * The share of the gauge an edited pick's 4K drawing takes (measured
 * 2026-10-29: 0.2-0.25 s of a 0.7-1 s run on a laptop iGPU).
 */
const DRAWING_SHARE = 15;

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
    pixelSize: string;
    blurNotice: string;
  };
  /** The shared background editor in the left pane. */
  editor: BackgroundEditorLabels;
  /** The recipe edit's copy, for the right pane's drawing spinner. */
  recipeEdit: RecipeEditLabels;
  solid: SolidColourLabels & {
    tab: string;
    /** The note over the "no background" preview. */
    previewNone: string;
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
    /**
     * The toggle under a covering-background group: delete its picture on
     * apply.
     */
    coveringDelete: string;
    /**
     * The same toggle under a covering background without a picture, and the
     * names of colour swatches: a solid colour, and any other fill (a
     * gradient, a pattern or a colour that could not be resolved).
     */
    coveringDeleteFill: string;
    solidSwatch: string;
    fillSwatch: string;
    slideCountTemplate: string;
    zoom: string;
    /** The zoom's toggle to fill the screen with the picture, as a slide show does, and back. */
    fullscreen: string;
    exitFullscreen: string;
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
  const [mode, setMode] = useState<BgMode>("all-slides");
  const [currentBgs, setCurrentBgs] = useState<SlideBackground[]>([]);
  /** The colour "no background" shows on the loaded deck. */
  const [themeBg, setThemeBg] = useState<string | null>(null);

  // Redesigned workspace state.
  const [slideAspect, setSlideAspect] = useState<SlideAspect>({
    kind: "16:9",
    ratio: 16 / 9,
  });
  const [groups, setGroups] = useState<BackgroundGroup[]>([]);
  const [groupThumbUrls, setGroupThumbUrls] = useState<Map<string, string>>(new Map());
  const [curIndex, setCurIndex] = useState(0);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  /** Covering-background groups whose delete toggle is off: the engine keeps them. */
  const [keptCovering, setKeptCovering] = useState<Set<string>>(new Set());
  const [selectedSlides, setSelectedSlides] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState<null | "selected" | "current">(null);
  /** The zoom fills the screen: the filtered preview is drawn at the screen's size. */
  const [zoomFullscreen, setZoomFullscreen] = useState(false);

  const aspectCss =
    slideAspect.kind === "4:3"
      ? "4 / 3"
      : slideAspect.kind === "16:9"
        ? "16 / 9"
        : `${slideAspect.ratio}`;

  /** The slide's shape, as the image sizing reads it. */
  const slide: SlideSize = { w: slideAspect.ratio, h: 1 };
  /** The background pick, its crop, recipe edit and filter set (the shared background editor). */
  const editor = useBackgroundEditor({
    slideRatio: slideAspect.ratio,
    copy: { errors: labels.errors, tooLarge: labels.background.tooLarge },
  });
  const {
    bgFile,
    previewUrl: bgPreviewUrl,
    normalizing,
    crop,
    framing,
    setFraming,
    fill,
    solidColour,
    filters,
    editedProps,
    editLive,
    editPending,
    pickSize,
    filterPreview,
    drawEdited,
    filteredStep,
  } = editor;
  // The latest thumbnails, for the cleanups that run after them.
  const groupThumbUrlsRef = useRef(groupThumbUrls);
  useEffect(() => {
    groupThumbUrlsRef.current = groupThumbUrls;
  }, [groupThumbUrls]);

  const {
    files: pptxFiles,
    setFiles: setPptxFilesRaw,
    status,
    progress,
    runLine,
    errorMessage,
    run,
    retry,
    download,
  } = useToolProcessor<Uint8Array>({
    processor: async (files, onProgress, needsScreen) => {
      // A solid colour with grain or a Paper filter goes in as a picture of
      // the colour, whole, its filters baked in as a picture's are; otherwise
      // it stays a fill, of the colour its colour effects make.
      const solid = fill?.kind === "colour" && bakesPicture(filters, "solid") ? fill : null;
      const filledFill = fill?.kind === "colour" ? { ...fill, rgb: filteredColour(filters, `#${fill.rgb}`).slice(1) } : fill;
      // An edited pick is drawn now, at the gallery file's size, so the frame
      // set on the file applies to it as is. The drawing is the gauge's first
      // share, so the gauge moves from the click on.
      const drawing = !fill && editedProps;
      // Baked in between the fit and the format; an unfiltered pick is prepared as before.
      const step = solid ? filteredStep(filters, "solid", needsScreen) : fill ? undefined : filteredStep(filters, "picture", needsScreen);
      if (drawing) onProgress(DRAWING_SHARE / 3);
      const file = drawing ? await needsScreen(() => drawEdited(editedProps)) : bgFile!;
      const shown = drawing ? (pct: number) => DRAWING_SHARE + (pct * (100 - DRAWING_SHARE)) / 100 : (pct: number) => pct;
      if (drawing) onProgress(DRAWING_SHARE);
      return changeBackground({
        pptxFile: files[0],
        background: solid
          ? { kind: "picture", file: await solidPictureFile(solid.rgb, slide) }
          : (filledFill ?? { kind: "picture", file, crop: crop ?? undefined }),
        mode,
        targetSlides:
          mode === "specific-slides"
            ? [...selectedSlides].sort((a, b) => a - b)
            : undefined,
        keptCovering: [...keptCovering],
        onProgress: (pct) => onProgress(shown(pct)),
        prepare: step ? slideImagePreparer(step) : undefined,
      });
    },
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

  const resetBackground = editor.reset;
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
      resetBackground();
      setMode("all-slides");
      setCheckedKeys(new Set());
      setKeptCovering(new Set());
      setSelectedSlides(new Set());
      setZoom(null);
      setPptxFilesRaw(files);
    },
    [setPptxFilesRaw, retry, resetBackground],
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the deck's derived state is cleared with the deck; the loaded branch fills it from async reads
      setThemeBg(null);
      setCurrentBgs([]);
      setGroups([]);
      groupThumbUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      setGroupThumbUrls(new Map());
      setCurIndex(0);
      setCheckedKeys(new Set());
      setKeptCovering(new Set());
      setSelectedSlides(new Set());
      return;
    }
    setCurIndex(0);
    setCheckedKeys(new Set());
    setKeptCovering(new Set());
    setSelectedSlides(new Set());
    let cancelled = false;

    getSlideAspect(pptxFile).then((a) => {
      if (!cancelled) setSlideAspect(a);
    });
    setThemeBg(null);
    themeBackground(pptxFile)
      .then((swatch) => {
        if (!cancelled) setThemeBg(swatch === "fill" ? null : swatch);
      })
      .catch(() => {});

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

  // Cleanup the group thumbnails' object URLs on unmount (the editor releases its own).
  useEffect(() => {
    return () => {
      groupThumbUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const totalSlides = currentBgs.length;

  /**
   * The picture the run would put in the deck, made by the same steps (the
   * edited recipe drawn, cut, fitted inside 4K, filtered, saved as PNG or
   * JPEG), while the zoom fills the screen: the preview is drawn at Full HD
   * from stand-ins, and grain and dots show differently when stretched to a
   * screen, so the full screen shows the file itself. Null until it is made,
   * or where the background is a fill.
   */
  const [actualUrl, setActualUrl] = useState<string | null>(null);
  /** The file for the full screen is being made. */
  const [actualPending, setActualPending] = useState(false);
  const slideRatio = slideAspect.ratio;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the last picture goes the moment its inputs change; the new one is drawn async below
    setActualUrl(null);
    setActualPending(false);
    if (!zoomFullscreen || zoom !== "selected") return;
    const solid = fill?.kind === "colour" ? fill : null;
    // A fill (no background, or a colour its effects keep a colour) shows as its colour.
    if (fill && !(solid && bakesPicture(filters, "solid"))) return;
    let current = true;
    let url: string | null = null;
    setActualPending(true);
    void (async () => {
      const slide = { w: slideRatio, h: 1 };
      const source = solid ? await solidPictureFile(solid.rgb, slide) : editedProps ? await drawRecipeFile(editedProps) : bgFile;
      if (!source || !current) return;
      const bitmap = await createImageBitmap(source);
      const size = { w: bitmap.width, h: bitmap.height };
      bitmap.close();
      const cut = solid ? { x: 0, y: 0, width: size.w, height: size.h } : (crop ?? maxFitCrop(size, slideRatio, 1));
      const prepared = await slideImagePreparer(filterStep(filters, solid ? "solid" : "picture"))(source, cut, slide);
      if (!current) return;
      // The bytes are the prepared picture's own buffer; a Blob takes them as they are.
      url = URL.createObjectURL(new Blob([prepared.bytes as Uint8Array<ArrayBuffer>], { type: `image/${prepared.format}` }));
      setActualUrl(url);
    })()
      .catch((err) => {
        // The preview stays in its place; the run reports its own failure.
        console.error("Full-screen picture failed to draw", err);
      })
      .finally(() => {
        if (current) setActualPending(false);
      });
    return () => {
      current = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [zoomFullscreen, zoom, fill, filters, editedProps, bgFile, crop, slideRatio]);
  // "No background" shows the deck's theme colour; white until it is read.
  const noneColour = themeBg ?? "#ffffff";
  // A solid colour as its fill: with its colour effects.
  const fillColour = !fill ? null : solidColour ? filteredColour(filters, solidColour) : noneColour;
  const canRun =
    !!pptxFile &&
    (!!bgFile || !!fill) &&
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

  const onToggleDelete = useCallback((key: string) => {
    setKeptCovering((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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

  // Back to the settings with everything kept, the picture, its frame and
  // its edit included: the user may only want to frame or tweak it again.
  const againBackground = editor.again;
  const handleTryAnother = useCallback(() => {
    retry();
    againBackground();
  }, [retry, againBackground]);

  // Zoom source: the selected background (a filtered colour, at its
  // picture's size) or the current group's thumb.
  const currentGroup = groups[curIndex];
  const currentThumbUrl = currentGroup ? groupThumbUrls.get(currentGroup.key) ?? null : null;
  const filledColour = (() => {
    if (!solidColour || !filterPreview) return null;
    const { width, height } = filledSize(slide);
    return { colour: solidColour, size: { w: width, h: height } };
  })();
  const selectedZoom = fill ? filledColour : bgPreviewUrl;
  const zoomSrc = zoom === "selected" ? selectedZoom : zoom === "current" ? currentThumbUrl : null;

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
      // The zoomed preview covers the right pane, where the run's status and
      // result show.
      onExecute={() => {
        setZoom(null);
        run();
      }}
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
              <BackgroundEditor
                editor={editor}
                slideRatio={slideAspect.ratio}
                // While a run uses the background (running, done or failed)
                // it is shown locked; `다시 하기` goes back to edit it.
                locked={status !== "idle"}
                noneColour={noneColour}
                labels={labels.editor}
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
                      live={editLive}
                      filtered={filterPreview}
                      sourceSize={pickSize}
                      aspect={aspectCss}
                      emptyLabel={labels.preview.selectedEmpty}
                      zoomLabel={labels.preview.zoom}
                      onZoom={() => setZoom("selected")}
                      crop={crop}
                      onSelect={bgFile && !framing ? () => setFraming(true) : undefined}
                      colour={fillColour}
                      colourNote={fill?.kind === "none" ? labels.solid.previewNone : undefined}
                      busyLabel={editPending ? labels.recipeEdit.drawing : null}
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
                      keptCovering={keptCovering}
                      onToggleDelete={onToggleDelete}
                      aspect={aspectCss}
                      slideCountTemplate={labels.preview.slideCountTemplate}
                      emptyLabel={labels.preview.currentEmpty}
                      deleteLabel={labels.preview.coveringDelete}
                      deleteFillLabel={labels.preview.coveringDeleteFill}
                      swatchLabels={{ solid: labels.preview.solidSwatch, fill: labels.preview.fillSwatch }}
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
                      visibility: crop && belowFullHd(crop, slide) ? "visible" : "hidden",
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
                  runLine={runLine}
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
                  sourceSize={zoom === "selected" ? pickSize : undefined}
                  busyLabel={zoom === "selected" && (editPending || actualPending) ? labels.recipeEdit.drawing : null}
                  live={zoom === "selected" ? editLive : null}
                  finished={zoom === "selected" ? filterPreview : null}
                  closeLabel={labels.preview.close}
                  fullscreenLabels={{ enter: labels.preview.fullscreen, exit: labels.preview.exitFullscreen }}
                  onFullscreenChange={setZoomFullscreen}
                  actual={zoom === "selected" ? actualUrl : null}
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
