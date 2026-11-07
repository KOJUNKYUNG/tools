"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EMBEDDED_ASSET_LIMIT } from "@/lib/constants";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { getErrorMessage, UserFacingError } from "@/lib/errors";
import { normalizeImageFile } from "@/lib/image/heic";
import type { CropRect } from "@/lib/image/maxFitCrop";
import type { PrepareStep } from "@/lib/image/slideImage";
import { filtersAfter, filtersFor, NO_FILTERS, type BackgroundKind, type FilterSet } from "@/lib/image/filterSet";
import { filterStep } from "@/lib/image/filterCanvas";
import type { GalleryImage } from "@/lib/gallery/types";
import { paperRecipe, type PaperRecipe } from "@/lib/gallery/recipes";
import {
  applyEdit,
  canAddColour,
  colourChips,
  controlsFor,
  editAreaFor,
  editStateAfter,
  FRESH_EDIT_STATE,
  startEdit,
  type EditState,
  type RecipeEdit,
} from "@/lib/gallery/recipeEdit";
import { drawRecipeFile } from "@/lib/gallery/drawRecipe";
import { LostContextError, webgl2Available } from "@/lib/gallery/paperRuntime";
import { galleryImageFile } from "@/lib/background/backgroundFiles";
import type { FillBackground } from "@/lib/ppt/changeBackground";
import type { NeedsScreen } from "@/lib/runPresence";
import type { Dictionary } from "@/i18n/config";
import { useRecipePreview } from "./useRecipePreview";
import { useFilterPreview } from "./useFilterPreview";

export interface BackgroundEditorCopy {
  /** Shared error copy (`common.errors`), in the page's language. */
  errors: Dictionary["common"]["errors"];
  /** The toast for an upload over the embedded-asset ceiling; `{size}` is the ceiling. */
  tooLarge: string;
}

/**
 * The background a tool's run puts in its deck, and how the user picks and
 * edits it: a gallery item, an upload or a solid colour (or "no background"),
 * its Background crop, its recipe edit and its filter set (CONTEXT
 * "Background crop", "Recipe edit", "Filter set").
 *
 * The rules: a new pick resets the crop and drops the recipe edit, the
 * filters stay; `again` (다시 하기) keeps everything; `reset` (new input
 * file) drops the pick and the filters.
 */
export function useBackgroundEditor({ slideRatio, copy }: { slideRatio: number; copy: BackgroundEditorCopy }) {
  const [bgFiles, setBgFiles] = useState<File[]>([]);
  const [galleryImage, setGalleryImage] = useState<GalleryImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  /** A picked HEIC is being converted; the upload button waits. */
  const [normalizing, setNormalizing] = useState(false);
  /** The Background crop the frame holds, in the picture's upright pixels. */
  const [crop, setCrop] = useState<CropRect | null>(null);
  /** The left pane shows the frame over the picked picture instead of the gallery. */
  const [framing, setFraming] = useState(false);
  /** A picked solid colour or "no background", in place of a picture. */
  const [fill, setFill] = useState<FillBackground | null>(null);
  /** The recipe edit of the picked Paper gallery item, and whether its area is open. */
  const [editState, setEditState] = useState<EditState>(FRESH_EDIT_STATE);
  /** The filter set laid over the background, kept across picks (CONTEXT "Filter set"). */
  const [filters, setFilters] = useState<FilterSet>(NO_FILTERS);

  const bgFile = bgFiles[0] ?? null;
  /** The picked solid colour (CSS), not "no background". */
  const solidColour = fill?.kind === "colour" ? `#${fill.rgb}` : null;
  // Only a Paper gallery item has a recipe to edit; photos, legacy gradients
  // and uploads are used as they are.
  const recipe = galleryImage?.source.kind === "paper" ? paperRecipe(galleryImage.name) : null;
  const { edit, open: editOpen } = editState;
  const recipeEdit = useMemo(() => (recipe ? (edit ?? startEdit(recipe)) : null), [recipe, edit]);
  /** What an edited pick draws; null when the gallery file itself applies. */
  const editedProps = useMemo(() => {
    if (!recipe || !recipeEdit) return null;
    // The recipe itself when the edit draws nothing else (what isEdited reads).
    const drawn = applyEdit(recipe, recipeEdit);
    return drawn === recipe ? null : drawn;
  }, [recipe, recipeEdit]);
  /** What the edit area shows, worked out once per edit (a crop drag re-renders the tool). */
  const editView = useMemo(
    () =>
      recipe && recipeEdit
        ? { controls: controlsFor(recipe), chips: colourChips(recipe, recipeEdit), canAdd: canAddColour(recipe, recipeEdit) }
        : null,
    [recipe, recipeEdit],
  );
  /** Change the edit from its latest state (a slider or colour picker reports many changes in a row). */
  const changeEdit = useCallback(
    (change: (edit: RecipeEdit) => RecipeEdit) => {
      if (recipe) setEditState((prev) => ({ ...prev, edit: change(prev.edit ?? startEdit(recipe)) }));
    },
    [recipe],
  );

  // The shown URL, kept by showPreview (its only setter) so the unmount
  // cleanup revokes the LATEST uploaded blob URL, not the mount-time null.
  const previewUrlRef = useRef<string | null>(null);
  // Each background pick takes a number; a slow pick (a gallery download, a
  // HEIC conversion) that finishes after a newer pick or a reset is dropped.
  const pickRef = useRef(0);

  /** Show `url` as the selected background, releasing the previous blob URL. */
  const showPreview = useCallback((url: string | null) => {
    const prev = previewUrlRef.current;
    if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }, []);

  useEffect(() => {
    return () => {
      const preview = previewUrlRef.current;
      if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
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
    setFill(null);
    setEditState((s) => editStateAfter(s, "pick"));
    setFilters((f) => filtersAfter(f, "pick"));
  }, [showPreview]);

  /**
   * Pick a solid colour or "no background": the picture pick goes. The
   * effects area under the colours stays open from one colour to the next,
   * so colours compare under the same filters as they are clicked.
   */
  const selectFill = useCallback(
    (next: FillBackground) => {
      const keepOpen = fill?.kind === "colour" && next.kind === "colour" && editOpen;
      clearPick();
      setFill(next);
      if (keepOpen) setEditState((s) => ({ ...s, open: true }));
    },
    [clearPick, fill?.kind, editOpen],
  );

  const selectGallery = useCallback(
    async (image: GalleryImage) => {
      // The picture already picked: back to its frame, framing kept, but
      // from the item's own look, as every pick from the gallery starts.
      if (image.id === galleryImage?.id && bgFile) {
        setEditState((s) => editStateAfter(s, "pick"));
        setFilters((f) => filtersAfter(f, "pick"));
        setFraming(true);
        return;
      }
      const pick = ++pickRef.current;
      // A HEIC still converting is dropped, so its busy state goes too.
      setNormalizing(false);
      setFill(null);
      setGalleryImage(image);
      setEditState((s) => editStateAfter(s, "pick"));
      setFilters((f) => filtersAfter(f, "pick"));
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

  const { errors, tooLarge } = copy;
  const upload = useCallback(
    async (files: File[]) => {
      const picked = files[0];
      if (!picked) return;
      // The background is embedded into the deck, so it bypasses the tool's
      // upload limit and gets its own (tighter) ceiling, checked on the file
      // as picked (before HEIC conversion).
      if (picked.size > EMBEDDED_ASSET_LIMIT) {
        toast.error(template(tooLarge, { size: formatBytes(EMBEDDED_ASSET_LIMIT) }));
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
          toast.error(getErrorMessage(err, { copy: errors, fallbackMessage: errors.heicConvertFailed }).message);
        }
        return;
      } finally {
        if (pick === pickRef.current) setNormalizing(false);
      }
      if (pick !== pickRef.current) return;
      setFill(null);
      setBgFiles([file]);
      setGalleryImage(null);
      setEditState((s) => editStateAfter(s, "pick"));
      setFilters((f) => filtersAfter(f, "pick"));
      setCrop(null);
      showPreview(URL.createObjectURL(file));
      setFraming(true);
    },
    [tooLarge, errors, showPreview],
  );

  /** A new input file: the pick and the filters go. */
  const reset = useCallback(() => {
    clearPick();
    setFilters((f) => filtersAfter(f, "reset"));
  }, [clearPick]);

  /** Undo the recipe edit; the filters it changed the defaults of go back with it. */
  const resetRecipe = useCallback(() => {
    setEditState((s) => editStateAfter(s, "reset"));
    setFilters((f) => filtersAfter(f, "recipeReset"));
  }, []);

  /** Undo the filter set. */
  const resetFilters = useCallback(() => setFilters((f) => filtersAfter(f, "reset")), []);

  /** Change some of the filters, from their latest state (a slider reports many changes in a row). */
  const changeFilters = useCallback((change: Partial<FilterSet>) => setFilters((f) => ({ ...f, ...change })), []);

  /** Open or close the edit area. */
  const setEditOpen = useCallback((open: boolean) => setEditState((s) => ({ ...s, open })), []);

  /** 다시 하기: back to the settings with everything kept, the frame open to tweak again. */
  const again = useCallback(() => {
    setEditState((s) => editStateAfter(s, "again"));
    setFilters((f) => filtersAfter(f, "again"));
    setFraming(true);
  }, []);

  /** What a failed drawing tells the user: that leaving the screen stopped it, or `otherwise`. */
  const drawFailureCopy = useCallback(
    (err: unknown, otherwise: string): string =>
      err instanceof LostContextError && err.afterLeaving ? errors.drawingInterrupted : otherwise,
    [errors.drawingInterrupted],
  );

  /**
   * The edited pick as a file. A failed drawing stops the run with its own
   * message: the unedited gallery file never stands in for the edit.
   */
  const drawEdited = useCallback(
    async (props: PaperRecipe): Promise<File> => {
      try {
        return await drawRecipeFile(props);
      } catch (err) {
        console.error("Edited background failed to draw", err);
        throw new UserFacingError(drawFailureCopy(err, errors.recipeDrawFailed));
      }
    },
    [drawFailureCopy, errors.recipeDrawFailed],
  );

  /**
   * The filter step of the picture path, for a picture or a solid colour's
   * picture. A failed drawing stops the run with its own message: the
   * unfiltered picture never stands in for the filters.
   */
  const filteredStep = useCallback(
    (set: FilterSet, kind: BackgroundKind, needsScreen: NeedsScreen): PrepareStep | undefined => {
      const step = filterStep(set, kind, needsScreen);
      if (!step) return undefined;
      return async (fitted) => {
        try {
          return await step(fitted);
        } catch (err) {
          console.error("Filters failed to draw", err);
          throw new UserFacingError(drawFailureCopy(err, errors.filterDrawFailed));
        }
      };
    },
    [drawFailureCopy, errors.filterDrawFailed],
  );

  // The live preview of an edit stands in for the gallery file wherever the
  // pick is shown; Paper Shaders load once the edit area opens.
  const editArea = editAreaFor(recipe, !!recipe && webgl2Available());
  const editAvailable = editArea === "edit";
  const { live: editLive, pending: editPending } = useRecipePreview(
    editAvailable && bgFile && (editOpen || editedProps) ? recipe : null,
    editedProps,
    // The frame would go on showing the unedited file: say so, as a run does.
    (err) => toast.error(drawFailureCopy(err, errors.recipeDrawFailed), { id: "recipe-preview" }),
  );
  /** The gallery pick's size, which the frame is held in and the live preview stands in for. */
  const pickSize = useMemo(
    () => (galleryImage ? { w: galleryImage.width, h: galleryImage.height } : undefined),
    [galleryImage],
  );
  const backgroundKind: BackgroundKind = !fill ? "picture" : fill.kind === "colour" ? "solid" : "none";
  // Read once a picture or a fill is in hand (it touches the DOM, absent while the page is served).
  const offeredFilters = bgFile || fill ? filtersFor(backgroundKind, webgl2Available()) : null;
  /** The selected-background preview with the filters baked in; null while unfiltered. */
  const filterPreview = useFilterPreview({
    filters,
    kind: backgroundKind,
    imageUrl: previewUrl,
    colour: solidColour,
    recipeLive: editLive,
    crop,
    sourceSize: pickSize,
    ratio: slideRatio,
    // The preview would go on showing the picture without the filter: say so, as a run does.
    onPaperFail: (err) => toast.error(drawFailureCopy(err, errors.filterDrawFailed), { id: "filter-preview" }),
  });

  return {
    /** The slide's width / height: the frame's locked aspect. */
    slideRatio,
    // The pick
    bgFile,
    galleryImage,
    previewUrl,
    normalizing,
    fill,
    solidColour,
    backgroundKind,
    pickSize,
    // The crop frame
    crop,
    setCrop,
    framing,
    setFraming,
    // The recipe edit
    recipe,
    recipeEdit,
    editedProps,
    editView,
    editState,
    setEditOpen,
    changeEdit,
    resetRecipe,
    editArea,
    editLive,
    editPending,
    // The filter set
    filters,
    changeFilters,
    resetFilters,
    offeredFilters,
    filterPreview,
    // Actions
    selectGallery,
    upload,
    selectFill,
    reset,
    again,
    // The run's drawing steps
    drawEdited,
    filteredStep,
  };
}

export type BackgroundEditorState = ReturnType<typeof useBackgroundEditor>;
