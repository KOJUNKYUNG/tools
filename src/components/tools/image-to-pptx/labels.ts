import type { Dictionary } from "@/i18n/config";
import type { BackgroundEditorLabels } from "@/components/background-editor/BackgroundEditor";
import type { BackgroundEditorCopy } from "@/components/background-editor/useBackgroundEditor";
import { getBackgroundEditorCopy, getBackgroundEditorLabels } from "@/components/background-editor/labels";

export interface ImageToPptxLabels {
  /** Shared error copy (`common.errors`), in the page's language. */
  errors: Dictionary["common"]["errors"];
  title: string; description: string; uploadPrompt: string; uploadHint: string;
  uploadMaxSize: string; reupload: string; convertTemplate: string;
  filesOneTemplate: string; filesManyTemplate: string; addAria: string;
  deleteAria: string; duplicateAria: string; processing: string; slideAspectLabel: string;
  aspect169: string; aspect43: string;
  screenSizeLabel: string; screenFullHd: string; screen4k: string;
  bgLabel: string; bgChange: string; bgCancel: string; bgDone: string; posX: string; posY: string;
  sizeW: string; sizeH: string; centerH: string; centerV: string;
  /** The line under the preview while part of the picture lies past the slide. */
  cutNotice: string;
  /** The question asked before making a deck where some slides' pictures fall wholly off the slide. */
  offSlide: { title: string; body: string; confirm: string; cancel: string };
  resultTitle: string; slideCountTemplate: string;
  download: string; again: string;
  alignLabel: string; alignTopLeft: string; alignCenter: string;
  errNotImage: string; errTooLarge: string; errNoImages: string;
  errorCorrupt: string;
  resizeHandles: Dictionary["common"]["resizeHandles"];
  /** The shared background editor "바꾸기" opens in the left half. */
  editor: BackgroundEditorLabels;
  editorCopy: BackgroundEditorCopy;
  /** The preview's zoom and its full screen; the same copy as ppt-background's. */
  zoom: { zoom: string; close: string; fullscreen: string; exitFullscreen: string };
  fileUpload: Dictionary["common"]["fileUpload"];
}

export function getImageToPptxLabels(dict: Dictionary): ImageToPptxLabels {
  const t = dict.tools["image-to-pptx"];
  const p = t.page;
  // The preview zoom's copy, where it began (as the shared editor's): ppt-background's.
  const preview = dict.tools["ppt-background"].page.preview;
  return {
    errors: dict.common.errors,
    title: t.title, description: t.description, uploadPrompt: p.uploadPrompt,
    uploadHint: p.uploadHint, uploadMaxSize: p.uploadMaxSize, reupload: p.reupload,
    convertTemplate: p.convert, filesOneTemplate: p.filesOne,
    filesManyTemplate: p.filesMany, addAria: p.addAria, deleteAria: p.deleteAria,
    duplicateAria: p.duplicateAria,
    processing: p.processing, slideAspectLabel: p.slideAspectLabel,
    aspect169: p.aspect169, aspect43: p.aspect43,
    screenSizeLabel: p.screenSizeLabel, screenFullHd: p.screenFullHd, screen4k: p.screen4k,
    bgLabel: p.bgLabel,
    bgChange: p.bgChange, bgCancel: p.bgCancel, bgDone: p.bgDone,
    posX: p.posX, posY: p.posY, sizeW: p.sizeW, sizeH: p.sizeH,
    centerH: p.centerH, centerV: p.centerV, cutNotice: p.cutNotice, offSlide: p.offSlide,
    resultTitle: p.resultTitle, slideCountTemplate: p.slideCount,
    download: p.download, again: p.again,
    alignLabel: p.alignLabel, alignTopLeft: p.alignTopLeft, alignCenter: p.alignCenter,
    errNotImage: p.errNotImage, errTooLarge: p.errTooLarge,
    errNoImages: p.errNoImages,
    errorCorrupt: p.errorCorrupt,
    resizeHandles: dict.common.resizeHandles,
    editor: getBackgroundEditorLabels(dict),
    editorCopy: getBackgroundEditorCopy(dict),
    zoom: {
      zoom: preview.zoom,
      close: preview.close,
      fullscreen: preview.fullscreen,
      exitFullscreen: preview.exitFullscreen,
    },
    fileUpload: dict.common.fileUpload,
  };
}
