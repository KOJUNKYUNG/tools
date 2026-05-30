import type { Dictionary } from "@/i18n/config";

export interface ImageToPptxLabels {
  title: string; description: string; uploadPrompt: string; uploadHint: string;
  uploadMaxSize: string; reupload: string; convertTemplate: string;
  filesOneTemplate: string; filesManyTemplate: string; addAria: string;
  deleteAria: string; duplicateAria: string; processing: string; slideAspectLabel: string;
  aspect169: string; aspect43: string; bgLabel: string; bgImage: string;
  bgColor: string; bgPick: string; placeLabel: string; posX: string; posY: string;
  sizeW: string; sizeH: string; centerH: string; centerV: string;
  resultTitle: string; slideCountTemplate: string;
  download: string; again: string;
  fileUpload: Dictionary["common"]["fileUpload"];
}

export function getImageToPptxLabels(dict: Dictionary): ImageToPptxLabels {
  const t = dict.tools["image-to-pptx"];
  const p = t.page;
  return {
    title: t.title, description: t.description, uploadPrompt: p.uploadPrompt,
    uploadHint: p.uploadHint, uploadMaxSize: p.uploadMaxSize, reupload: p.reupload,
    convertTemplate: p.convert, filesOneTemplate: p.filesOne,
    filesManyTemplate: p.filesMany, addAria: p.addAria, deleteAria: p.deleteAria,
    duplicateAria: p.duplicateAria,
    processing: p.processing, slideAspectLabel: p.slideAspectLabel,
    aspect169: p.aspect169, aspect43: p.aspect43, bgLabel: p.bgLabel,
    bgImage: p.bgImage, bgColor: p.bgColor, bgPick: p.bgPick, placeLabel: p.placeLabel,
    posX: p.posX, posY: p.posY, sizeW: p.sizeW, sizeH: p.sizeH,
    centerH: p.centerH, centerV: p.centerV,
    resultTitle: p.resultTitle, slideCountTemplate: p.slideCount,
    download: p.download, again: p.again, fileUpload: dict.common.fileUpload,
  };
}
