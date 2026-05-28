import type { Dictionary } from "@/i18n/config";

export interface ImageToPdfLabels {
  title: string;
  description: string;
  uploadPrompt: string;
  uploadHint: string;
  uploadMaxSize: string;
  reupload: string;
  convertTemplate: string;
  filesOneTemplate: string;
  filesManyTemplate: string;
  addAria: string;
  rotateAria: string;
  deleteAria: string;
  processing: string;
  sizeLabel: string;
  sizeFit: string;
  sizeA4: string;
  sizeCustom: string;
  customWidth: string;
  customHeight: string;
  resultTitle: string;
  pageCountTemplate: string;
  download: string;
  compressHandoff: string;
  again: string;
  fileUpload: Dictionary["common"]["fileUpload"];
}

export function getImageToPdfLabels(dict: Dictionary): ImageToPdfLabels {
  const t = dict.tools["image-to-pdf"];
  const p = t.page;
  return {
    title: t.title,
    description: t.description,
    uploadPrompt: p.uploadPrompt,
    uploadHint: p.uploadHint,
    uploadMaxSize: p.uploadMaxSize,
    reupload: p.reupload,
    convertTemplate: p.convert,
    filesOneTemplate: p.filesOne,
    filesManyTemplate: p.filesMany,
    addAria: p.addAria,
    rotateAria: p.rotateAria,
    deleteAria: p.deleteAria,
    processing: p.processing,
    sizeLabel: p.sizeLabel,
    sizeFit: p.sizeFit,
    sizeA4: p.sizeA4,
    sizeCustom: p.sizeCustom,
    customWidth: p.customWidth,
    customHeight: p.customHeight,
    resultTitle: p.resultTitle,
    pageCountTemplate: p.pageCount,
    download: p.download,
    compressHandoff: p.compressHandoff,
    again: p.again,
    fileUpload: dict.common.fileUpload,
  };
}
