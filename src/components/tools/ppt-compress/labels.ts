import type { Dictionary } from "@/i18n/config";

export interface PptCompressLabels {
  title: string;
  description: string;
  uploadPrompt: string;
  uploadHint: string;
  uploadMaxSize: string;
  reupload: string;
  reset: string;
  fileInfoTemplate: string;
  slideCountTemplate: string;
  presetGroupLabel: string;
  presetLightLabel: string;
  presetLightDesc: string;
  presetMediumLabel: string;
  presetMediumDesc: string;
  presetHeavyLabel: string;
  presetHeavyDesc: string;
  compress: string;
  processing: string;
  estimateTemplate: string;
  estimateActualTemplate: string;
  estimateNoChange: string;
  resultTitle: string;
  originalSizeLabel: string;
  compressedSizeLabel: string;
  savingsLabel: string;
  download: string;
  again: string;
  analyzingHint: string;
  previewUnavailable: string;
  imagesLabel: string;
  imageCountTemplate: string;
  noImagesHint: string;
  errorMemory: string;
  errorCorrupt: string;
  fileUpload: Dictionary["common"]["fileUpload"];
}

export function getPptCompressLabels(dict: Dictionary): PptCompressLabels {
  const t = dict.tools["ppt-compress"];
  const p = t.page;
  return {
    title: t.title,
    description: t.description,
    uploadPrompt: p.uploadPrompt,
    uploadHint: p.uploadHint,
    uploadMaxSize: p.uploadMaxSize,
    reupload: p.reupload,
    reset: p.reset,
    fileInfoTemplate: p.fileInfo,
    slideCountTemplate: p.slideCount,
    presetGroupLabel: p.presetGroupLabel,
    presetLightLabel: p.presetLightLabel,
    presetLightDesc: p.presetLightDesc,
    presetMediumLabel: p.presetMediumLabel,
    presetMediumDesc: p.presetMediumDesc,
    presetHeavyLabel: p.presetHeavyLabel,
    presetHeavyDesc: p.presetHeavyDesc,
    compress: p.compress,
    processing: p.processing,
    estimateTemplate: p.estimateTemplate,
    estimateActualTemplate: p.estimateActualTemplate,
    estimateNoChange: p.estimateNoChange,
    resultTitle: p.resultTitle,
    originalSizeLabel: p.originalSizeLabel,
    compressedSizeLabel: p.compressedSizeLabel,
    savingsLabel: p.savingsLabel,
    download: p.download,
    again: p.again,
    analyzingHint: p.analyzingHint,
    previewUnavailable: p.previewUnavailable,
    imagesLabel: p.imagesLabel,
    imageCountTemplate: p.imageCount,
    noImagesHint: p.noImagesHint,
    errorMemory: p.errorMemory,
    errorCorrupt: p.errorCorrupt,
    fileUpload: dict.common.fileUpload,
  };
}
