import type { Locale } from "@/i18n/locales";

// Interim label source for the pdf-arrange editor. Task 2.7 migrates these
// strings into the i18n dictionaries (ko.json / en.json) and switches
// getPdfArrangeLabels to read from the Dictionary; until then the editor is
// already labels-driven (no hardcoded UI text in the components) so that swap
// is a one-line source change, not a component rewrite.

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
  /** Result + status strings (used from 2.5/2.6). */
  processing: string;
  done: string;
  download: string;
  again: string;
  oversizeWarning: string;
  dismiss: string;
}

const KO: PdfArrangeLabels = {
  title: "PDF 합치기 / 나누기 / 정렬",
  description: "여러 PDF를 하나의 파일로 합치거나, 구분선으로 여러 파일로 나눕니다.",
  reset: "초기화",
  uploadPrompt: "PDF 또는 이미지를 드래그하거나 클릭하여 업로드",
  uploadHint: "PDF는 페이지별로, 이미지는 한 페이지로 펼쳐집니다.",
  uploadMaxSize: "최대 {size}",
  reupload: "다시 업로드",
  filesOneTemplate: "{name}",
  filesManyTemplate: "{name} +{rest}개 파일",
  splitAll: "모두 분할",
  clearSplits: "구분선 해제",
  applyTemplate: "적용 ({n}개 파일)",
  rotateAria: "90° 회전",
  deleteAria: "페이지 삭제",
  addAria: "파일 추가",
  processing: "처리 중…",
  done: "완료되었습니다",
  download: "다운로드",
  again: "다시 선택",
  oversizeWarning: "총 용량이 큽니다({size}). 브라우저에서 처리 시 느려질 수 있습니다.",
  dismiss: "닫기",
};

const EN: PdfArrangeLabels = {
  title: "Merge / Split / Arrange PDF",
  description:
    "Combine PDFs into one file, or use dividers to split into several.",
  reset: "Reset",
  uploadPrompt: "Drag or click to upload PDFs or images",
  uploadHint: "PDFs expand per page; images become a single page.",
  uploadMaxSize: "Max {size}",
  reupload: "Re-upload",
  filesOneTemplate: "{name}",
  filesManyTemplate: "{name} +{rest} files",
  splitAll: "Split all",
  clearSplits: "Clear dividers",
  applyTemplate: "Apply ({n} files)",
  rotateAria: "Rotate 90°",
  deleteAria: "Delete page",
  addAria: "Add files",
  processing: "Processing…",
  done: "Done",
  download: "Download",
  again: "Start over",
  oversizeWarning:
    "Large total size ({size}). In-browser processing may be slow.",
  dismiss: "Dismiss",
};

export function getPdfArrangeLabels(lang: Locale): PdfArrangeLabels {
  return lang === "en" ? EN : KO;
}
