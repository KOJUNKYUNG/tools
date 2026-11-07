import type { Dictionary } from "@/i18n/config";
import type { GalleryCategory } from "@/lib/gallery/types";
import type { BackgroundEditorLabels } from "./BackgroundEditor";
import type { BackgroundEditorCopy } from "./useBackgroundEditor";

/**
 * The shared background editor's copy, the same in every tool that mounts it.
 * It lives under ppt-background's dictionary, where the editor began.
 */
export function getBackgroundEditorLabels(dict: Dictionary): BackgroundEditorLabels {
  const p = dict.tools["ppt-background"].page;
  const categoryByKey: Record<GalleryCategory, string> = {
    gradient: p.gallery.categoryGradient,
    nature: p.gallery.categoryNature,
    texture: p.gallery.categoryTexture,
    pattern: p.gallery.categoryPattern,
  };
  return {
    uploadLabel: p.background.uploadLabel,
    backToGallery: p.background.backToGallery,
    pixelSize: p.background.pixelSize,
    pictureAlt: p.preview.selectedCaption,
    handles: dict.common.resizeHandles,
    gallery: {
      heading: p.gallery.heading,
      countSuffixTemplate: p.gallery.countSuffixTemplate,
      categoryAll: p.gallery.categoryAll,
      categoryByKey,
      empty: p.gallery.empty,
      titles: p.gallery.titles,
    },
    recipeEdit: p.recipeEdit,
    filters: p.filters,
    solid: p.solid,
  };
}

/** The hook's copy: shared errors and the upload ceiling's toast. */
export function getBackgroundEditorCopy(dict: Dictionary): BackgroundEditorCopy {
  return { errors: dict.common.errors, tooLarge: dict.tools["ppt-background"].page.background.tooLarge };
}
