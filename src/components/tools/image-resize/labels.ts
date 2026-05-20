import type { Dictionary } from "@/i18n/config";

export interface ImageResizeLabels {
  title: string;
  subtitle: string;
  header: { title: string; description: string; reset: string };
  originalSize: string;
  revertToOriginal: string;
  widthLabel: string;
  heightLabel: string;
  lockAspect: string;
  unlockAspect: string;
  cropToggle: string;
  cropToggleHint: string;
  sizePresetsTitle: string;
  ratioPresetsTitle: string;
  customRatio: string;
  apply: string;
  doneTitle: string;
  download: string;
  downloadAgainLabel: string;
  reupload: string;
  compressLink: string;
  uploadPrompt: string;
  uploadHint: string;
  uploadMaxSize: string;
  tryAgain: string;
  cropSelectionLabel: string;
  stretchModeLabel: string;
  cropFooterTemplate: string;
  sizePresetLabels: Record<string, string>;
}

export function getImageResizeLabels(dict: Dictionary): ImageResizeLabels {
  const page = dict.tools["image-resize"].page;
  return {
    title: page.title,
    subtitle: page.subtitle,
    header: page.header,
    originalSize: page.originalSize,
    revertToOriginal: page.revertToOriginal,
    widthLabel: page.widthLabel,
    heightLabel: page.heightLabel,
    lockAspect: page.lockAspect,
    unlockAspect: page.unlockAspect,
    cropToggle: page.cropToggle,
    cropToggleHint: page.cropToggleHint,
    sizePresetsTitle: page.sizePresetsTitle,
    ratioPresetsTitle: page.ratioPresetsTitle,
    customRatio: page.customRatio,
    apply: page.apply,
    doneTitle: page.doneTitle,
    download: page.download,
    downloadAgainLabel: page.downloadAgainLabel,
    reupload: page.reupload,
    compressLink: page.compressLink,
    uploadPrompt: page.uploadPrompt,
    uploadHint: page.uploadHint,
    uploadMaxSize: dict.common.fileUpload.maxSize,
    tryAgain: page.tryAgain,
    cropSelectionLabel: page.cropSelectionLabel,
    stretchModeLabel: page.stretchModeLabel,
    cropFooterTemplate: page.cropFooterTemplate,
    sizePresetLabels: {
      fhd: page.sizePreset.fhd,
      hd: page.sizePreset.hd,
      square: page.sizePreset.square,
      mobile: page.sizePreset.mobile,
      uhd4k: page.sizePreset.uhd4k,
      instaPortrait: page.sizePreset.instaPortrait,
    },
  };
}
