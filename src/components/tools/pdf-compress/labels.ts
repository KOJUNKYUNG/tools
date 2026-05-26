import type { Dictionary } from "@/i18n/config";

export interface PdfCompressLabels {
  // Header (used by page chrome variant)
  title: string;
  description: string;
  // Upload
  uploadPrompt: string;
  uploadHint: string;
  uploadMaxSize: string;
  reupload: string;
  reset: string;
  // File info
  fileInfoTemplate: string;
  // Preset group
  presetGroupLabel: string;
  presetLightLabel: string;
  presetLightDesc: string;
  presetMediumLabel: string;
  presetMediumDesc: string;
  presetHeavyLabel: string;
  presetHeavyDesc: string;
  // Action
  compress: string;
  processing: string;
  // Compare / estimate
  comparePreview: string;
  compareToggleAria: string;
  estimateTemplate: string;
  estimateActualTemplate: string;
  estimateNoChange: string;
  // Result
  resultTitle: string;
  originalSizeLabel: string;
  compressedSizeLabel: string;
  savingsLabel: string;
  download: string;
  again: string;
  // Errors
  errorMemory: string;
}

export function getPdfCompressLabels(dict: Dictionary): PdfCompressLabels {
  const t = dict.tools["pdf-compress"];
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
    presetGroupLabel: p.presetGroupLabel,
    presetLightLabel: p.presetLightLabel,
    presetLightDesc: p.presetLightDesc,
    presetMediumLabel: p.presetMediumLabel,
    presetMediumDesc: p.presetMediumDesc,
    presetHeavyLabel: p.presetHeavyLabel,
    presetHeavyDesc: p.presetHeavyDesc,
    compress: p.compress,
    processing: p.processing,
    comparePreview: p.comparePreview,
    compareToggleAria: p.compareToggleAria,
    estimateTemplate: p.estimateTemplate,
    estimateActualTemplate: p.estimateActualTemplate,
    estimateNoChange: p.estimateNoChange,
    resultTitle: p.resultTitle,
    originalSizeLabel: p.originalSizeLabel,
    compressedSizeLabel: p.compressedSizeLabel,
    savingsLabel: p.savingsLabel,
    download: p.download,
    again: p.again,
    errorMemory: p.errorMemory,
  };
}
