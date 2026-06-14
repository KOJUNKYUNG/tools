import type { Dictionary } from "@/i18n/config";

export interface PdfArrangeLabels {
  title: string;
  description: string;
  reset: string;
  uploadPrompt: string;
  uploadHint: string;
  uploadMaxSize: string;
  reupload: string;
  /** "{name}" alone, or with "{rest}" extra-files suffix appended. */
  filesOneTemplate: string;
  filesManyTemplate: string;
  splitAll: string;
  clearSplits: string;
  applyTemplate: string;
  rotateAria: string;
  deleteAria: string;
  addAria: string;
  processing: string;
  done: string;
  download: string;
  again: string;
  oversizeWarning: string;
  dismiss: string;
  resultTitle: string;
  outputCountTemplate: string;
  pageCountTemplate: string;
  downloadPdf: string;
  downloadZipTemplate: string;
  downloadOneAria: string;
  fileUpload: Dictionary["common"]["fileUpload"];
}

export function getPdfArrangeLabels(dict: Dictionary): PdfArrangeLabels {
  const tool = dict.tools["pdf-arrange"];
  const page = tool.page;
  return {
    title: tool.title,
    description: tool.description,
    reset: page.reset,
    uploadPrompt: page.uploadPrompt,
    uploadHint: page.uploadHint,
    uploadMaxSize: dict.common.fileUpload.maxSizeEach,
    reupload: page.reupload,
    filesOneTemplate: page.filesOneTemplate,
    filesManyTemplate: page.filesManyTemplate,
    splitAll: page.splitAll,
    clearSplits: page.clearSplits,
    applyTemplate: page.applyTemplate,
    rotateAria: page.rotateAria,
    deleteAria: page.deleteAria,
    addAria: page.addAria,
    processing: page.processing,
    done: page.done,
    download: page.download,
    again: page.again,
    oversizeWarning: page.oversizeWarning,
    dismiss: page.dismiss,
    resultTitle: page.resultTitle,
    outputCountTemplate: page.outputCountTemplate,
    pageCountTemplate: page.pageCountTemplate,
    downloadPdf: page.downloadPdf,
    downloadZipTemplate: page.downloadZipTemplate,
    downloadOneAria: page.downloadOneAria,
    fileUpload: dict.common.fileUpload,
  };
}
