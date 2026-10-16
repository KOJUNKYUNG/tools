import type { Dictionary } from "@/i18n/config";
import type { CompressionPreset } from "@/lib/pdf/compressPdf";

export interface PdfCompressLabels {
  // Header (used by page chrome variant)
  title: string;
  description: string;
  // Upload
  uploadPrompt: string;
  uploadHint: string;
  reupload: string;
  // File info
  fileInfoTemplate: string;
  pageCountTemplate: string;
  oversizeBadge: string;
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
  // Preview / estimate
  zoomAria: string;
  compareHoldLabel: string;
  compareHoldHint: string;
  originalBadge: string;
  estimateActualTemplate: string;
  estimateComputing: string;
  estimateAfterCompress: string;
  estimateNotSmaller: string;
  previewDeferredHint: string;
  imageReencodeSkippedNote: string;
  // Result
  resultTitle: string;
  notSmallerTitle: string;
  /** `{preset}` and `{next}`: the chosen and the next stronger preset's name. */
  notSmallerTryStronger: string;
  /** `{preset}`: the strongest preset's name. */
  notSmallerOptimized: string;
  originalSizeLabel: string;
  compressedSizeLabel: string;
  savingsLabel: string;
  download: string;
  again: string;
  // Errors
  errorMemory: string;
  errorCorrupt: string;
  errorEncrypted: string;
  // Shared FileUpload labels (toasts + file list i18n)
  fileUpload: Dictionary["common"]["fileUpload"];
}

/** A preset's display name (Light / Medium / Heavy). */
export function presetLabel(preset: CompressionPreset, labels: PdfCompressLabels): string {
  return { low: labels.presetLightLabel, medium: labels.presetMediumLabel, high: labels.presetHeavyLabel }[
    preset
  ];
}

export function getPdfCompressLabels(dict: Dictionary): PdfCompressLabels {
  const t = dict.tools["pdf-compress"];
  const p = t.page;
  return {
    title: t.title,
    description: t.description,
    uploadPrompt: p.uploadPrompt,
    uploadHint: p.uploadHint,
    reupload: p.reupload,
    fileInfoTemplate: p.fileInfo,
    pageCountTemplate: p.pageCount,
    oversizeBadge: p.oversizeBadge,
    presetGroupLabel: p.presetGroupLabel,
    presetLightLabel: p.presetLightLabel,
    presetLightDesc: p.presetLightDesc,
    presetMediumLabel: p.presetMediumLabel,
    presetMediumDesc: p.presetMediumDesc,
    presetHeavyLabel: p.presetHeavyLabel,
    presetHeavyDesc: p.presetHeavyDesc,
    compress: p.compress,
    processing: p.processing,
    zoomAria: p.zoomAria,
    compareHoldLabel: p.compareHoldLabel,
    compareHoldHint: p.compareHoldHint,
    originalBadge: p.originalBadge,
    estimateActualTemplate: p.estimateActualTemplate,
    estimateComputing: p.estimateComputing,
    estimateAfterCompress: p.estimateAfterCompress,
    estimateNotSmaller: p.estimateNotSmaller,
    previewDeferredHint: p.previewDeferredHint,
    imageReencodeSkippedNote: p.imageReencodeSkippedNote,
    resultTitle: p.resultTitle,
    notSmallerTitle: p.notSmallerTitle,
    notSmallerTryStronger: p.notSmallerTryStronger,
    notSmallerOptimized: p.notSmallerOptimized,
    originalSizeLabel: p.originalSizeLabel,
    compressedSizeLabel: p.compressedSizeLabel,
    savingsLabel: p.savingsLabel,
    download: p.download,
    again: p.again,
    errorMemory: p.errorMemory,
    errorCorrupt: p.errorCorrupt,
    errorEncrypted: p.errorEncrypted,
    fileUpload: dict.common.fileUpload,
  };
}
