"use client";

import { activeFilters, isFiltered } from "@/lib/image/filterSet";
import { addColour, removeColour, setColour } from "@/lib/gallery/recipeEdit";
import { BackgroundPicker, type BackgroundPickerLabels } from "./BackgroundPicker";
import type { EditGroup } from "./EditArea";
import { FilterControls, filterSummary, type FilterLabels } from "./FilterControls";
import { RecipeEditControls, type RecipeEditLabels } from "./RecipeEditControls";
import type { BackgroundEditorState } from "./useBackgroundEditor";
import type { NoneColours } from "./SolidColourGrid";

export type BackgroundEditorLabels = BackgroundPickerLabels & {
  /** The recipe edit under the frame of a Paper gallery item. */
  recipeEdit: RecipeEditLabels;
  /** The filter set's group in the edit area of every picture and solid colour. */
  filters: FilterLabels;
};

interface BackgroundEditorProps {
  editor: BackgroundEditorState;
  /**
   * A run uses the background (running, done or failed): the frame and the
   * picked fill are shown as they are and nothing responds; 다시 하기 goes
   * back to edit them.
   */
  locked: boolean;
  /** What the "no background" tile shows (`NoneColours`); null leaves the tile out. */
  noneColours: NoneColours | null;
  labels: BackgroundEditorLabels;
}

/**
 * The shared background editor: the category tabs, gallery, solid colour
 * grid and upload button, then the crop frame with its pixel-size line and
 * the edit area ("shape" for a Paper gallery item's recipe edit, "effects"
 * for the filter set). Its state lives in `useBackgroundEditor`, which the
 * tool holds, so the tool's run and preview read the same pick.
 */
export function BackgroundEditor({ editor, locked, noneColours, labels }: BackgroundEditorProps) {
  const {
    slideRatio,
    bgFile,
    previewUrl,
    fill,
    filters,
    changeFilters,
    resetFilters,
    backgroundKind,
    offeredFilters,
    recipe,
    recipeEdit,
    editView,
    editedProps,
    editState,
    setEditOpen,
    resetRecipe,
    changeEdit,
    editArea,
    editLive,
    editPending,
    pickSize,
    crop,
    setCrop,
    setFrameSize,
    restores,
    framing,
    setFraming,
  } = editor;
  const editOpen = editState.open;

  /** The filter set's group, in a picture's edit area or a solid colour's. */
  const effectsGroup: EditGroup | null = offeredFilters
    ? {
        name: labels.filters.effects,
        resetLabel: labels.filters.reset,
        edited: isFiltered(filters, backgroundKind),
        summary: filterSummary(activeFilters(filters, backgroundKind), labels.filters),
        onReset: resetFilters,
        controls: (
          <FilterControls
            offered={offeredFilters}
            filters={filters}
            onChange={changeFilters}
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
          onReset: resetRecipe,
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
              version: restores,
              onCropChange: setCrop,
              onSourceSize: setFrameSize,
              onBack: () => setFraming(false),
              locked,
              busyLabel: editPending ? labels.recipeEdit.drawing : null,
              edit: bgFile
                ? {
                    heading: labels.recipeEdit.heading,
                    open: editOpen,
                    onOpenChange: setEditOpen,
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
      noneColours={noneColours}
      fillLocked={!!fill && locked}
      fillEdit={
        // "No background" is the theme's colour by definition: no effects.
        fill?.kind === "colour" && effectsGroup
          ? {
              heading: labels.recipeEdit.heading,
              open: editOpen,
              onOpenChange: setEditOpen,
              groups: [effectsGroup],
              locked,
            }
          : null
      }
      labels={labels}
    />
  );
}
