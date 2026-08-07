import type { Dictionary } from "@/i18n/config";

export interface ImageCompressLabels {
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
  fileUpload: Dictionary["common"]["fileUpload"];
}

export function getImageCompressLabels(dict: Dictionary): ImageCompressLabels {
  const page = dict.tools["image-compress"].page;
  return {
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
    fileUpload: dict.common.fileUpload,
  };
}
