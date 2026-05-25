import type { Dictionary } from "@/i18n/config";

export interface PdfToImageLabels {
  title: string;
  description: string;
  uploadPrompt: string;
  uploadHint: string;
  uploadMaxSize: string;
  reupload: string;
  addAria: string;
  convertTemplate: string;
  filesOneTemplate: string;
  filesManyTemplate: string;
  rotateAria: string;
  deleteAria: string;
  processing: string;
  formatLabel: string;
  formatJpg: string;
  formatPng: string;
  dpiLabel: string;
  dpi72: string;
  dpi150: string;
  dpi300: string;
  dpiHint: string;
  dpiAbout: string;
  resultTitle: string;
  imageCountTemplate: string;
  download: string;
  downloadSingleTemplate: string;
  downloadOneAria: string;
  compressHandoff: string;
  again: string;
}

export function getPdfToImageLabels(dict: Dictionary): PdfToImageLabels {
  const t = dict.tools["pdf-to-image"];
  const p = t.page;
  return {
    title: t.title,
    description: t.description,
    uploadPrompt: p.uploadPrompt,
    uploadHint: p.uploadHint,
    uploadMaxSize: p.uploadMaxSize,
    reupload: p.reupload,
    addAria: p.addAria,
    convertTemplate: p.convert,
    filesOneTemplate: p.filesOne,
    filesManyTemplate: p.filesMany,
    rotateAria: p.rotateAria,
    deleteAria: p.deleteAria,
    processing: p.processing,
    formatLabel: p.formatLabel,
    formatJpg: p.formatJpg,
    formatPng: p.formatPng,
    dpiLabel: p.dpiLabel,
    dpi72: p.dpi72,
    dpi150: p.dpi150,
    dpi300: p.dpi300,
    dpiHint: p.dpiHint,
    dpiAbout: p.dpiAbout,
    resultTitle: p.resultTitle,
    imageCountTemplate: p.imageCount,
    download: p.download,
    downloadSingleTemplate: p.downloadSingle,
    downloadOneAria: p.downloadOneAria,
    compressHandoff: p.compressHandoff,
    again: p.again,
  };
}
