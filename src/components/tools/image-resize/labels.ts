import type { Dictionary } from "@/i18n/config";

export interface ImageResizeLabels {
  title: string;
  subtitle: string;
  originalSize: string;
  widthLabel: string;
  heightLabel: string;
  lockAspect: string;
  unlockAspect: string;
  cropToggle: string;
  cropToggleHint: string;
  sizePresetsTitle: string;
  ratioPresetsTitle: string;
  apply: string;
  doneTitle: string;
  download: string;
  downloadAgainLabel: string;
  reupload: string;
  compressLink: string;
  resultSummary: string;
  uploadPrompt: string;
  uploadHint: string;
}

export function getImageResizeLabels(dict: Dictionary): ImageResizeLabels {
  const page = dict.tools["image-resize"].page;
  return {
    title: page.title,
    subtitle: page.subtitle,
    originalSize: page.originalSize,
    widthLabel: page.widthLabel,
    heightLabel: page.heightLabel,
    lockAspect: page.lockAspect,
    unlockAspect: page.unlockAspect,
    cropToggle: page.cropToggle,
    cropToggleHint: page.cropToggleHint,
    sizePresetsTitle: page.sizePresetsTitle,
    ratioPresetsTitle: page.ratioPresetsTitle,
    apply: page.apply,
    doneTitle: page.doneTitle,
    download: page.download,
    downloadAgainLabel: page.downloadAgainLabel,
    reupload: page.reupload,
    compressLink: page.compressLink,
    resultSummary: page.resultSummary,
    uploadPrompt: page.uploadPrompt,
    uploadHint: page.uploadHint,
  };
}
