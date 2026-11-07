"use client";

import type { Dictionary } from "@/i18n/config";
import { activeFilters, filtersAfter, isFiltered } from "@/lib/image/filterSet";
import { addColour, editStateAfter, removeColour, setColour } from "@/lib/gallery/recipeEdit";
import type { GalleryLabels } from "@/components/ppt/InlineGallery";
import { BackgroundPicker } from "./BackgroundPicker";
import type { EditGroup } from "./EditArea";
import { FilterControls, filterSummary, type FilterLabels } from "./FilterControls";
import { RecipeEditControls, type RecipeEditLabels } from "./RecipeEditControls";
import type { SolidColourLabels } from "./SolidColourGrid";
import type { BackgroundEditorState } from "./useBackgroundEditor";

export interface BackgroundEditorLabels {
  uploadLabel: string;
  backToGallery: string;
  /** The line under the frame: `{sw} × {sh}` the source, `{w} × {h}` the crop. */
  pixelSize: string;
  pictureAlt: string;
  handles: Dictionary["common"]["resizeHandles"];
  gallery: GalleryLabels;
  /** The recipe edit under the frame of a Paper gallery item. */
  recipeEdit: RecipeEditLabels;
  /** The filter set's group in the edit area of every picture and solid colour. */
  filters: FilterLabels;
  solid: SolidColourLabels & { tab: string };
}

interface BackgroundEditorProps {
  editor: BackgroundEditorState;
  /** The slide's width / height: the frame's locked aspect. */
  slideRatio: number;
  /**
   * A run uses the background (running, done or failed): the frame and the
   * picked fill are shown as they are and nothing responds; 다시 하기 goes
   * back to edit them.
   */
  locked: boolean;
  /** The colour the "no background" tile shows (`#rrggbb`); null leaves the tile out. */
  noneColour: string | null;
  labels: BackgroundEditorLabels;
}

/**
 * The shared background editor: the category tabs, gallery, solid colour
 * grid and upload button, then the crop frame with its pixel-size line and
 * the edit area ("shape" for a Paper gallery item's recipe edit, "effects"
 * for the filter set). Its state lives in `useBackgroundEditor`, which the
 * tool holds, so the tool's run and preview read the same pick.
 */
export function BackgroundEditor({ editor, slideRatio, locked, noneColour, labels }: BackgroundEditorProps) {
  const {
    bgFile,
    previewUrl,
    fill,
    filters,
    setFilters,
    backgroundKind,
    offeredFilters,
    recipe,
    recipeEdit,
    editView,
    editedProps,
    editState,
    setEditState,
    changeEdit,
    editArea,
    editLive,
    editPending,
    pickSize,
    crop,
    setCrop,
    framing,
    setFraming,
  } = editor;
  const editOpen = editState.open;
  const onOpenChange = (open: boolean) => setEditState((s) => ({ ...s, open }));

  /** The filter set's group, in a picture's edit area or a solid colour's. */
  const effectsGroup: EditGroup | null = offeredFilters
    ? {
        name: labels.filters.effects,
        resetLabel: labels.filters.reset,
        edited: isFiltered(filters, backgroundKind),
        summary: filterSummary(activeFilters(filters, backgroundKind), labels.filters),
        onReset: () => setFilters((f) => filtersAfter(f, "reset")),
        controls: (
          <FilterControls
            offered={offeredFilters}
            filters={filters}
            onChange={(change) => setFilters((f) => ({ ...f, ...change }))}
            locked={locked}
            labels={labels.filters}
          />
        ),
      }
    : null;

  const shapeGroup: EditGroup | null =
    editArea === "edit" && recipe && recipeEdit && editView
      ? {
          name: labels.recipeEdit.shape,
          resetLabel: labels.recipeEdit.reset,
          edited: !!editedProps,
          onReset: () => {
            setEditState((s) => editStateAfter(s, "reset"));
            setFilters((f) => filtersAfter(f, "recipeReset"));
          },
          controls: (
            <RecipeEditControls
              controls={editView.controls}
              edit={recipeEdit}
              onHueShift={(degrees) => changeEdit((e) => ({ ...e, hueShift: degrees }))}
              onSlider={(slider, value) => changeEdit((e) => ({ ...e, [slider]: value }))}
              chips={editView.chips}
              canAddColour={editView.canAdd}
              onColour={(id, hex) => changeEdit((e) => setColour(recipe, e, id, hex))}
              onAddColour={() => changeEdit((e) => addColour(recipe, e))}
              onRemoveColour={(id) => changeEdit((e) => removeColour(recipe, e, id))}
              locked={locked}
              labels={labels.recipeEdit}
            />
          ),
        }
      : null;

  return (
    <BackgroundPicker
      galleryImage={editor.galleryImage}
      onGallerySelect={editor.selectGallery}
      onDirectUpload={editor.upload}
      uploadBusy={editor.normalizing}
      // While a run uses the picture its frame is shown locked.
      frame={
        (framing || locked) && previewUrl
          ? {
              imageUrl: previewUrl,
              live: editLive,
              sourceSize: pickSize,
              ratio: slideRatio,
              crop,
              onCropChange: setCrop,
              onBack: () => setFraming(false),
              locked,
              busyLabel: editPending ? labels.recipeEdit.drawing : null,
              edit: bgFile
                ? {
                    heading: labels.recipeEdit.heading,
                    open: editOpen,
                    onOpenChange,
                    // Without WebGL2 the recipe edit is not offered, and its note shows in its place.
                    note: editArea === "unavailable" ? labels.recipeEdit.unavailable : null,
                    groups: [...(shapeGroup ? [shapeGroup] : []), ...(effectsGroup ? [effectsGroup] : [])],
                    locked,
                  }
                : null,
            }
          : null
      }
      fill={fill}
      onFillSelect={editor.selectFill}
      noneColour={noneColour}
      fillLocked={!!fill && locked}
      fillEdit={
        // "No background" is the theme's colour by definition: no effects.
        fill?.kind === "colour" && effectsGroup
          ? {
              heading: labels.recipeEdit.heading,
              open: editOpen,
              onOpenChange,
              groups: [effectsGroup],
              locked,
            }
          : null
      }
      labels={{
        uploadLabel: labels.uploadLabel,
        backToGallery: labels.backToGallery,
        pixelSize: labels.pixelSize,
        pictureAlt: labels.pictureAlt,
        handles: labels.handles,
        gallery: labels.gallery,
        solid: labels.solid,
      }}
    />
  );
}
