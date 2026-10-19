import type { Dictionary } from "@/i18n/config";

export interface ImageCompressLabels {
  /** Shared error copy (`common.errors`), in the page's language. */
  errors: Dictionary["common"]["errors"];
  title: string;
  subtitle: string;
  header: { title: string; description: string };
  reupload: string;
  uploadPrompt: string;
  uploadHint: string;
  uploadMaxSize: string;
  formatTitle: string;
  qualityTitle: string;
  compressTemplate: string;
  moreImagesTemplate: string;
  estimateTemplate: string;
  estimating: string;
  /** A saving that rounds to 0% but is not nothing, worded to say it shrank. */
  estimateUnderOnePct: string;
  pngLossless: string;
  doneTitle: string;
  settingsTemplate: string;
  download: string;
  recompress: string;
  sizeChangeTemplate: string;
  removeAria: string;
  prevAria: string;
  nextAria: string;
  comparePreview: string;
  estimateNotSmaller: string;
  notSmallerTitle: string;
  notSmallerLowerQuality: string;
  notSmallerLowestQuality: string;
  notSmallerPng: string;
  keptOriginalTemplate: string;
  keptOriginalsNote: string;
  errorCorrupt: string;
  errorFormatUnsupported: string;
  fileUpload: Dictionary["common"]["fileUpload"];
}

export function getImageCompressLabels(dict: Dictionary): ImageCompressLabels {
  const page = dict.tools["image-compress"].page;
  return {
    errors: dict.common.errors,
    title: page.title,
    subtitle: page.subtitle,
    header: page.header,
    reupload: page.reupload,
    uploadPrompt: page.uploadPrompt,
    uploadHint: page.uploadHint,
    uploadMaxSize: dict.common.fileUpload.maxSizeEach,
    formatTitle: page.formatTitle,
    qualityTitle: page.qualityTitle,
    compressTemplate: page.compressTemplate,
    moreImagesTemplate: page.moreImagesTemplate,
    estimateTemplate: page.estimateTemplate,
    estimating: page.estimating,
    estimateUnderOnePct: page.estimateUnderOnePct,
    pngLossless: page.pngLossless,
    doneTitle: page.doneTitle,
    settingsTemplate: page.settingsTemplate,
    download: page.download,
    recompress: page.recompress,
    sizeChangeTemplate: page.sizeChangeTemplate,
    removeAria: page.removeAria,
    prevAria: page.prevAria,
    nextAria: page.nextAria,
    comparePreview: page.comparePreview,
    estimateNotSmaller: page.estimateNotSmaller,
    notSmallerTitle: page.notSmallerTitle,
    notSmallerLowerQuality: page.notSmallerLowerQuality,
    notSmallerLowestQuality: page.notSmallerLowestQuality,
    notSmallerPng: page.notSmallerPng,
    keptOriginalTemplate: page.keptOriginalTemplate,
    keptOriginalsNote: page.keptOriginalsNote,
    errorCorrupt: page.errorCorrupt,
    errorFormatUnsupported: page.errorFormatUnsupported,
    fileUpload: dict.common.fileUpload,
  };
}
