import type { Dictionary } from "@/i18n/config";
import type { CompressionPreset } from "@/lib/ppt/pptCompressPlan";

export interface PptCompressLabels {
  title: string;
  description: string;
  uploadPrompt: string;
  uploadHint: string;
  uploadMaxSize: string;
  reupload: string;
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
  notSmallerTitle: string;
  /** `{preset}` and `{next}`: the chosen and the next stronger preset's name. */
  notSmallerTryStronger: string;
  /** `{preset}`: the strongest preset's name. */
  notSmallerOptimized: string;
  /** No image could be re-encoded, so no preset can help. */
  notSmallerNoImages: string;
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

/** A preset's display name (Light / Medium / Heavy). */
export function presetLabel(preset: CompressionPreset, labels: PptCompressLabels): string {
  return { low: labels.presetLightLabel, medium: labels.presetMediumLabel, high: labels.presetHeavyLabel }[
    preset
  ];
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
    notSmallerTitle: p.notSmallerTitle,
    notSmallerTryStronger: p.notSmallerTryStronger,
    notSmallerOptimized: p.notSmallerOptimized,
    notSmallerNoImages: p.notSmallerNoImages,
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
