import type { Dictionary } from "@/i18n/config";

export interface ImageToPdfLabels {
  /** Shared error copy (`common.errors`), in the page's language. */
  errors: Dictionary["common"]["errors"];
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
  sizePreset: string;
  sizeFit: string;
  sizeCustom: string;
  presetAria: string;
  presetGroupPrint: string;
  presetGroupScreen: string;
  /** A print preset's option: `{name}`, `{w}` and `{h}` in whole millimetres. */
  presetPrintOptionTemplate: string;
  presetNameLetter: string;
  presetScreenWide: string;
  presetScreenStandard: string;
  customWidth: string;
  customHeight: string;
  orientationLabel: string;
  orientationAuto: string;
  orientationPortrait: string;
  orientationLandscape: string;
  marginLabel: string;
  marginNone: string;
  /** A margin option: `{n}` millimetres. */
  marginOptionTemplate: string;
  /** The margin row's fourth choice: the picture covers the page (CONTEXT "Fill page"). */
  marginFill: string;
  /** The picture quality row (CONTEXT "Picture quality"). */
  qualityLabel: string;
  qualityOriginal: string;
  qualityHigh: string;
  qualityStandard: string;
  resultTitle: string;
  pageCountTemplate: string;
  download: string;
  compressHandoff: string;
  again: string;
  /** Shown when the output check blocks a broken PDF. */
  errorCorrupt: string;
  fileUpload: Dictionary["common"]["fileUpload"];
}

export function getImageToPdfLabels(dict: Dictionary): ImageToPdfLabels {
  const t = dict.tools["image-to-pdf"];
  const p = t.page;
  return {
    errors: dict.common.errors,
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
    sizePreset: p.sizePreset,
    sizeFit: p.sizeFit,
    sizeCustom: p.sizeCustom,
    presetAria: p.presetAria,
    presetGroupPrint: p.presetGroupPrint,
    presetGroupScreen: p.presetGroupScreen,
    presetPrintOptionTemplate: p.presetPrintOption,
    presetNameLetter: p.presetNameLetter,
    presetScreenWide: p.presetScreenWide,
    presetScreenStandard: p.presetScreenStandard,
    customWidth: p.customWidth,
    customHeight: p.customHeight,
    orientationLabel: p.orientationLabel,
    orientationAuto: p.orientationAuto,
    orientationPortrait: p.orientationPortrait,
    orientationLandscape: p.orientationLandscape,
    marginLabel: p.marginLabel,
    marginNone: p.marginNone,
    marginOptionTemplate: p.marginOption,
    marginFill: p.marginFill,
    qualityLabel: p.qualityLabel,
    qualityOriginal: p.qualityOriginal,
    qualityHigh: p.qualityHigh,
    qualityStandard: p.qualityStandard,
    resultTitle: p.resultTitle,
    pageCountTemplate: p.pageCount,
    download: p.download,
    compressHandoff: p.compressHandoff,
    again: p.again,
    errorCorrupt: p.errorCorrupt,
    fileUpload: dict.common.fileUpload,
  };
}
