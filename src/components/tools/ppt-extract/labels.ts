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
  // File info
  fileInfoTemplate: string;
  // Action
  extract: string;
  extractCountTemplate: string;
  processing: string;
  // Result
  resultTitle: string;
  imageCountTemplate: string;
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
  // Handoff
  toPptx: string;
  // Shared FileUpload labels (toasts + file list i18n)
  fileUpload: Dictionary["common"]["fileUpload"];
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
    fileInfoTemplate: p.fileInfo,
    extract: p.extract,
    extractCountTemplate: p.extractCount,
    processing: p.processing,
    resultTitle: p.resultTitle,
    imageCountTemplate: p.imageCount,
    downloadZip: p.downloadZip,
    downloadOneAria: p.downloadOneAria,
    again: p.again,
    placeholderLabel: p.placeholderLabel,
    analyzingHint: p.analyzingHint,
    previewUnavailable: p.previewUnavailable,
    imagesLabel: p.imagesLabel,
    noImagesHint: p.noImagesHint,
    errorNoImages: p.errorNoImages,
    toPptx: p.toPptx,
    fileUpload: dict.common.fileUpload,
  };
}
