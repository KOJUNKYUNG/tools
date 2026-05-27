import type { Dictionary } from "@/i18n/config";

export interface PptExtractLabels {
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
  // Action
  extract: string;
  processing: string;
  // Result
  resultTitle: string;
  imageCountTemplate: string;
  totalSizeLabel: string;
  downloadZip: string;
  downloadOneAria: string;
  again: string;
  placeholderLabel: string;
  // Preview (idle state)
  analyzingHint: string;
  previewUnavailable: string;
  imagesLabel: string;
  noImagesHint: string;
  // Errors
  errorNoImages: string;
}

export function getPptExtractLabels(dict: Dictionary): PptExtractLabels {
  const t = dict.tools["ppt-extract"];
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
    extract: p.extract,
    processing: p.processing,
    resultTitle: p.resultTitle,
    imageCountTemplate: p.imageCount,
    totalSizeLabel: p.totalSizeLabel,
    downloadZip: p.downloadZip,
    downloadOneAria: p.downloadOneAria,
    again: p.again,
    placeholderLabel: p.placeholderLabel,
    analyzingHint: p.analyzingHint,
    previewUnavailable: p.previewUnavailable,
    imagesLabel: p.imagesLabel,
    noImagesHint: p.noImagesHint,
    errorNoImages: p.errorNoImages,
  };
}
