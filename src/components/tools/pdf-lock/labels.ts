import type { Dictionary } from "@/i18n/config";

export interface PdfLockLabels {
  title: string;
  description: string;
  uploadPrompt: string;
  uploadHint: string;
  uploadMaxSize: string;
  reupload: string;
  fileInfoTemplate: string;
  modeLock: string;
  modeUnlock: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  confirmLabel: string;
  confirmPlaceholder: string;
  showPassword: string;
  hidePassword: string;
  unlockPasswordLabel: string;
  unlockPasswordPlaceholder: string;
  permissionsLabel: string;
  allowPrint: string;
  allowCopy: string;
  permissionsHint: string;
  permissionsViewerNote: string;
  previewNote: string;
  previewEncrypted: string;
  badgeEncrypted: string;
  badgePlain: string;
  lockDisabledHint: string;
  unlockDisabledHint: string;
  lock: string;
  unlock: string;
  processing: string;
  needPassword: string;
  needPasswordTooShort: string;
  passwordMismatch: string;
  resultLockTitle: string;
  resultUnlockTitle: string;
  resultSizeTemplate: string;
  download: string;
  again: string;
  errorMemory: string;
  errorCorrupt: string;
  errorWrongPassword: string;
  fileUpload: Dictionary["common"]["fileUpload"];
}

export function getPdfLockLabels(dict: Dictionary): PdfLockLabels {
  const t = dict.tools["pdf-lock"];
  const p = t.page;
  return {
    title: t.title,
    description: t.description,
    uploadPrompt: p.uploadPrompt,
    uploadHint: p.uploadHint,
    uploadMaxSize: p.uploadMaxSize,
    reupload: p.reupload,
    fileInfoTemplate: p.fileInfo,
    modeLock: p.modeLock,
    modeUnlock: p.modeUnlock,
    passwordLabel: p.passwordLabel,
    passwordPlaceholder: p.passwordPlaceholder,
    confirmLabel: p.confirmLabel,
    confirmPlaceholder: p.confirmPlaceholder,
    showPassword: p.showPassword,
    hidePassword: p.hidePassword,
    unlockPasswordLabel: p.unlockPasswordLabel,
    unlockPasswordPlaceholder: p.unlockPasswordPlaceholder,
    permissionsLabel: p.permissionsLabel,
    allowPrint: p.allowPrint,
    allowCopy: p.allowCopy,
    permissionsHint: p.permissionsHint,
    permissionsViewerNote: p.permissionsViewerNote,
    previewNote: p.previewNote,
    previewEncrypted: p.previewEncrypted,
    badgeEncrypted: p.badgeEncrypted,
    badgePlain: p.badgePlain,
    lockDisabledHint: p.lockDisabledHint,
    unlockDisabledHint: p.unlockDisabledHint,
    lock: p.lock,
    unlock: p.unlock,
    processing: p.processing,
    needPassword: p.needPassword,
    needPasswordTooShort: p.needPasswordTooShort,
    passwordMismatch: p.passwordMismatch,
    resultLockTitle: p.resultLockTitle,
    resultUnlockTitle: p.resultUnlockTitle,
    resultSizeTemplate: p.resultSize,
    download: p.download,
    again: p.again,
    errorMemory: p.errorMemory,
    errorCorrupt: p.errorCorrupt,
    errorWrongPassword: p.errorWrongPassword,
    fileUpload: dict.common.fileUpload,
  };
}
