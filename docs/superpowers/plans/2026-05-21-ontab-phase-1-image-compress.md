# image-compress silver migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `/tools/image-compress` to the Ontab silver design system with a two-column layout (preview + carousel | controls + scrollable file list), a format-required compress gate, and a live estimated output size, mounted inline in `Screen3Workspace`.

**Architecture:** Mirror the `image-resize` pattern — a presentational subcomponent set under `src/components/tools/image-compress/` orchestrated by `ImageCompressTool`, which renders bare body when `inline` and full silver card chrome otherwise. Core compression (`src/lib/image/compressImage.ts`) is reused unchanged. One new pure function (`computeSavings`) is TDD'd. Screen3's chained inline-tool ternary is refactored to a switch.

**Tech Stack:** Next.js (App Router), TypeScript strict, React function components + hooks, vitest (node env), lucide-react, existing `useToolProcessor` / `FileUpload` / `ProcessingStatus` / `template` / `toolHandoff` / `downloadBlob` utilities.

**Conventions:** One task at a time with user approval between tasks (Done/Why/Next recap). No new silver tokens or material classes — reuse `globals.css`. No `git add -A` (explicit paths). Magic numbers (e.g. list max-height, region min-height) stay inline this PR and go to the polish backlog for tokenization. Static verification only (`pnpm exec tsc --noEmit` + `pnpm build`); components have no jsdom tests (Phase 1 infra decision) — visual + handoff verification is manual by the user.

---

## File Structure

**Create:**
- `src/lib/image/computeSavings.ts` — pure savings calc (saved bytes + percent).
- `src/lib/image/computeSavings.test.ts` — unit tests (node env).
- `src/components/tools/image-compress/labels.ts` — `getImageCompressLabels` + `ImageCompressLabels`.
- `src/components/tools/image-compress/ImageCompressPreview.tsx` — left column (filename row, re-upload, preview, carousel).
- `src/components/tools/image-compress/ImageCompressControls.tsx` — format segmented + quality slider + estimate line.
- `src/components/tools/image-compress/ImageCompressFileList.tsx` — scrollable list (idle vs done rows).
- `src/components/tools/image-compress/ImageCompressResult.tsx` — result card.
- `src/components/tools/image-compress/ImageCompressTool.tsx` — orchestrator.

**Modify:**
- `src/i18n/dictionaries/ko.json` — expand `tools.image-compress` with `page`.
- `src/i18n/dictionaries/en.json` — expand `tools.image-compress` with `page` (same shape).
- `src/app/[lang]/(chrome)/tools/image-compress/page.tsx` — replace old client body with server component.
- `src/components/landing/Screen3Workspace.tsx` — ternary→switch refactor + image-compress inline branch.

---

## Task 1: `computeSavings` pure function (TDD)

**Files:**
- Create: `src/lib/image/computeSavings.ts`
- Test: `src/lib/image/computeSavings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/image/computeSavings.test.ts
import { describe, it, expect } from "vitest";
import { computeSavings } from "./computeSavings";

describe("computeSavings", () => {
  it("computes saved bytes and percent for a normal reduction", () => {
    expect(computeSavings(100, 25)).toEqual({ saved: 75, pct: 75 });
  });

  it("returns zero percent when the original size is 0", () => {
    expect(computeSavings(0, 0)).toEqual({ saved: 0, pct: 0 });
  });

  it("returns a negative percent when the output grew", () => {
    expect(computeSavings(100, 150)).toEqual({ saved: -50, pct: -50 });
  });

  it("rounds the percent to the nearest integer", () => {
    expect(computeSavings(1000, 333)).toEqual({ saved: 667, pct: 67 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/image/computeSavings.test.ts`
Expected: FAIL — `Failed to resolve import "./computeSavings"` / `computeSavings is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/image/computeSavings.ts
export interface Savings {
  /** original - compressed, in bytes. Negative when the output grew. */
  saved: number;
  /** Percent of the original saved, rounded. 0 when original is 0. */
  pct: number;
}

/**
 * Compute how much a compression saved. Pure; reused by the live estimate
 * line and the done-mode file rows.
 */
export function computeSavings(
  originalBytes: number,
  compressedBytes: number,
): Savings {
  const saved = originalBytes - compressedBytes;
  const pct = originalBytes > 0 ? Math.round((saved / originalBytes) * 100) : 0;
  return { saved, pct };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/image/computeSavings.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/image/computeSavings.ts src/lib/image/computeSavings.test.ts
git commit -m "feat: add computeSavings pure helper for image-compress"
```

---

## Task 2: i18n keys (KO + EN)

**Files:**
- Modify: `src/i18n/dictionaries/ko.json` (the `tools.image-compress` entry, currently a single line)
- Modify: `src/i18n/dictionaries/en.json` (the `tools.image-compress` entry, currently a single line)

- [ ] **Step 1: Expand the KO entry**

In `src/i18n/dictionaries/ko.json`, replace the line:
```json
    "image-compress": { "title": "이미지 압축·변환", "description": "여러 이미지를 한 번에 압축하고 포맷을 바꿉니다." },
```
with:
```json
    "image-compress": {
      "title": "이미지 압축·변환",
      "description": "여러 이미지를 한 번에 압축하고 포맷을 바꿉니다.",
      "page": {
        "title": "이미지 압축·변환",
        "subtitle": "JPG·PNG·WebP 이미지를 압축하거나 다른 형식으로 변환합니다.",
        "header": {
          "title": "이미지 압축·변환",
          "description": "JPG·PNG·WebP 이미지를 압축하거나 다른 형식으로 변환합니다.",
          "reset": "도구 초기화"
        },
        "reupload": "다시 업로드",
        "uploadPrompt": "이미지를 드래그하거나 클릭하여 업로드",
        "uploadHint": "JPG, PNG, WebP 파일을 지원합니다. 여러 장을 한 번에 올릴 수 있습니다.",
        "formatTitle": "포맷 선택",
        "qualityTitle": "품질",
        "compressTemplate": "이미지 압축하기 ({n}개)",
        "moreImagesTemplate": "+{n}개 이미지",
        "estimateTemplate": "예상 ~{size} · 원본 대비 {pct}",
        "estimating": "예상 용량 계산 중…",
        "pngLossless": "PNG는 무손실 — 품질 설정이 적용되지 않습니다.",
        "doneTitle": "압축 완료",
        "settingsTemplate": "{format} · 품질 {quality}%",
        "download": "다운로드",
        "recompress": "다시 압축",
        "sizeChangeTemplate": "{from} → {to}",
        "removeAria": "{name} 제거",
        "prevAria": "이전 이미지",
        "nextAria": "다음 이미지"
      }
    },
```

- [ ] **Step 2: Expand the EN entry (identical shape)**

In `src/i18n/dictionaries/en.json`, replace the line:
```json
    "image-compress": { "title": "Compress & convert", "description": "Batch-compress and convert formats." },
```
with:
```json
    "image-compress": {
      "title": "Compress & convert",
      "description": "Batch-compress and convert formats.",
      "page": {
        "title": "Compress & convert images",
        "subtitle": "Compress JPG/PNG/WebP images or convert them to another format.",
        "header": {
          "title": "Compress & convert images",
          "description": "Compress JPG/PNG/WebP images or convert them to another format.",
          "reset": "Reset"
        },
        "reupload": "Re-upload",
        "uploadPrompt": "Drag images here, or click to upload",
        "uploadHint": "JPG, PNG, WebP supported. Upload multiple at once.",
        "formatTitle": "Output format",
        "qualityTitle": "Quality",
        "compressTemplate": "Compress images ({n})",
        "moreImagesTemplate": "+{n} more",
        "estimateTemplate": "Est. ~{size} · {pct} vs original",
        "estimating": "Estimating size…",
        "pngLossless": "PNG is lossless — the quality setting has no effect.",
        "doneTitle": "Compression complete",
        "settingsTemplate": "{format} · quality {quality}%",
        "download": "Download",
        "recompress": "Compress again",
        "sizeChangeTemplate": "{from} → {to}",
        "removeAria": "Remove {name}",
        "prevAria": "Previous image",
        "nextAria": "Next image"
      }
    },
```

- [ ] **Step 3: Verify JSON validity + type compile**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no JSON parse errors; the new `page` keys are now part of the `Dictionary` type. Note: en.json must match ko.json's shape or `getDictionary` fails to typecheck — both edits above are identical in structure.)

- [ ] **Step 4: Commit**

```bash
git add src/i18n/dictionaries/ko.json src/i18n/dictionaries/en.json
git commit -m "feat: add image-compress page i18n strings (KO + EN)"
```

---

## Task 3: `labels.ts`

**Files:**
- Create: `src/components/tools/image-compress/labels.ts`

- [ ] **Step 1: Write the labels module**

```ts
// src/components/tools/image-compress/labels.ts
import type { Dictionary } from "@/i18n/config";

export interface ImageCompressLabels {
  title: string;
  subtitle: string;
  header: { title: string; description: string; reset: string };
  reupload: string;
  uploadPrompt: string;
  uploadHint: string;
  uploadMaxSize: string;
  formatTitle: string;
  qualityTitle: string;
  compressTemplate: string;
  moreImagesTemplate: string;
  estimateTemplate: string;
  estimating: string;
  pngLossless: string;
  doneTitle: string;
  settingsTemplate: string;
  download: string;
  recompress: string;
  sizeChangeTemplate: string;
  removeAria: string;
  prevAria: string;
  nextAria: string;
}

export function getImageCompressLabels(dict: Dictionary): ImageCompressLabels {
  const page = dict.tools["image-compress"].page;
  return {
    title: page.title,
    subtitle: page.subtitle,
    header: page.header,
    reupload: page.reupload,
    uploadPrompt: page.uploadPrompt,
    uploadHint: page.uploadHint,
    uploadMaxSize: dict.common.fileUpload.maxSize,
    formatTitle: page.formatTitle,
    qualityTitle: page.qualityTitle,
    compressTemplate: page.compressTemplate,
    moreImagesTemplate: page.moreImagesTemplate,
    estimateTemplate: page.estimateTemplate,
    estimating: page.estimating,
    pngLossless: page.pngLossless,
    doneTitle: page.doneTitle,
    settingsTemplate: page.settingsTemplate,
    download: page.download,
    recompress: page.recompress,
    sizeChangeTemplate: page.sizeChangeTemplate,
    removeAria: page.removeAria,
    prevAria: page.prevAria,
    nextAria: page.nextAria,
  };
}
```

- [ ] **Step 2: Verify compile**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/image-compress/labels.ts
git commit -m "feat: add image-compress labels mapper"
```

---

## Task 4: `ImageCompressFileList`

**Files:**
- Create: `src/components/tools/image-compress/ImageCompressFileList.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/tools/image-compress/ImageCompressFileList.tsx
"use client";

import { XIcon } from "lucide-react";
import { template } from "@/lib/common/template";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface IdleEntry {
  name: string;
  size: number;
}

interface DoneEntry {
  name: string;
  originalSize: number;
  compressedSize: number;
}

interface ImageCompressFileListProps {
  mode: "idle" | "done";
  idleFiles: IdleEntry[];
  doneResults: DoneEntry[];
  onRemove: (index: number) => void;
  removeAriaTemplate: string;
  sizeChangeTemplate: string;
}

export function ImageCompressFileList({
  mode,
  idleFiles,
  doneResults,
  onRemove,
  removeAriaTemplate,
  sizeChangeTemplate,
}: ImageCompressFileListProps) {
  return (
    <div
      className="space-y-1.5 overflow-y-auto pr-1"
      style={{ maxHeight: "220px" }}
    >
      {mode === "idle"
        ? idleFiles.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="flex h-9 items-center gap-2 rounded-[6px] border px-3 font-body text-[12px]"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border)",
                color: "var(--ink)",
              }}
            >
              <span
                className="min-w-0 flex-1 truncate"
                style={{ color: "var(--ink-strong)" }}
              >
                {f.name}
              </span>
              <span className="shrink-0" style={{ color: "var(--ink-soft)" }}>
                {formatBytes(f.size)}
              </span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={template(removeAriaTemplate, { name: f.name })}
                className="shrink-0 rounded p-0.5 transition-colors hover:text-[color:var(--accent-copper)]"
                style={{ color: "var(--ink-soft)" }}
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ))
        : doneResults.map((r, i) => (
            <div
              key={`${r.name}-${i}`}
              className="flex h-9 items-center gap-2 rounded-[6px] border px-3 font-body text-[12px]"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border)",
                color: "var(--ink)",
              }}
            >
              <span
                className="min-w-0 flex-1 truncate"
                style={{ color: "var(--ink-strong)" }}
              >
                {r.name}
              </span>
              <span className="shrink-0" style={{ color: "var(--ink-soft)" }}>
                {template(sizeChangeTemplate, {
                  from: formatBytes(r.originalSize),
                  to: formatBytes(r.compressedSize),
                })}
              </span>
            </div>
          ))}
    </div>
  );
}
```

Note (trap b): the filename uses `min-w-0 flex-1 truncate` inside a flex row so it shrinks and truncates rather than forcing the row wider. Note (magic number): `maxHeight: "220px"` is inline this PR → polish backlog (token extraction).

- [ ] **Step 2: Verify compile**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/image-compress/ImageCompressFileList.tsx
git commit -m "feat: add image-compress file list (idle/done rows)"
```

---

## Task 5: `ImageCompressControls`

**Files:**
- Create: `src/components/tools/image-compress/ImageCompressControls.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/tools/image-compress/ImageCompressControls.tsx
"use client";

import { template } from "@/lib/common/template";
import type { OutputFormat } from "@/lib/image/compressImage";

const FORMAT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: "image/jpeg", label: "JPG" },
  { value: "image/png", label: "PNG" },
  { value: "image/webp", label: "WebP" },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function pctText(pct: number): string {
  if (pct > 0) return `-${pct}%`;
  if (pct < 0) return `+${-pct}%`;
  return "±0%";
}

interface ImageCompressControlsProps {
  formatTitle: string;
  qualityTitle: string;
  outputFormat: OutputFormat | null;
  onSelectFormat: (format: OutputFormat) => void;
  quality: number;
  onQualityChange: (quality: number) => void;
  estimate: { size: number; pct: number } | null;
  estimating: boolean;
  estimateTemplate: string;
  estimatingLabel: string;
  pngLosslessLabel: string;
}

export function ImageCompressControls({
  formatTitle,
  qualityTitle,
  outputFormat,
  onSelectFormat,
  quality,
  onQualityChange,
  estimate,
  estimating,
  estimateTemplate,
  estimatingLabel,
  pngLosslessLabel,
}: ImageCompressControlsProps) {
  let estimateLine: string;
  if (outputFormat === "image/png") {
    estimateLine = pngLosslessLabel;
  } else if (!outputFormat) {
    estimateLine = " ";
  } else if (estimating) {
    estimateLine = estimatingLabel;
  } else if (estimate) {
    estimateLine = template(estimateTemplate, {
      size: formatBytes(estimate.size),
      pct: pctText(estimate.pct),
    });
  } else {
    estimateLine = " ";
  }

  return (
    <div className="space-y-3">
      <div>
        <p
          className="mb-1.5 font-display text-[11px]"
          style={{ color: "var(--ink-soft)" }}
        >
          {formatTitle}
        </p>
        <div className="flex gap-1.5">
          {FORMAT_OPTIONS.map((opt) => {
            const active = outputFormat === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onSelectFormat(opt.value)}
                className="h-8 flex-1 rounded-[5px] border px-3 font-display text-[12px] font-medium transition-colors"
                style={
                  active
                    ? {
                        background: "var(--accent-electric)",
                        color: "#fff",
                        borderColor: "var(--accent-electric)",
                        boxShadow: "0 1px 2px rgba(20,30,60,0.15)",
                      }
                    : {
                        background: "var(--surface-2)",
                        color: "var(--ink-strong)",
                        borderColor: "var(--border)",
                      }
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p
            className="font-display text-[11px]"
            style={{ color: "var(--ink-soft)" }}
          >
            {qualityTitle}
          </p>
          <span
            className="font-display text-[12px] font-semibold"
            style={{ color: "var(--accent-electric)" }}
          >
            {quality}%
          </span>
        </div>
        <input
          type="range"
          min={10}
          max={100}
          step={1}
          value={quality}
          onChange={(e) => onQualityChange(Number(e.target.value))}
          className="w-full"
          style={{ accentColor: "var(--accent-electric)" }}
        />
        <div
          className="mt-1 font-body text-[11px] leading-[1.4]"
          style={{ color: "var(--ink-soft)", minHeight: "16px" }}
        >
          {estimateLine}
        </div>
      </div>
    </div>
  );
}
```

Note (UI stability): the estimate line always reserves `minHeight: 16px` and renders a non-breaking space when empty, so toggling format/quality never shifts the layout. The format-active indicator uses background/box-shadow (no border-width change).

- [ ] **Step 2: Verify compile**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/image-compress/ImageCompressControls.tsx
git commit -m "feat: add image-compress controls (format + quality + estimate)"
```

---

## Task 6: `ImageCompressPreview`

**Files:**
- Create: `src/components/tools/image-compress/ImageCompressPreview.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/tools/image-compress/ImageCompressPreview.tsx
"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { template } from "@/lib/common/template";

interface ImageCompressPreviewProps {
  fileName: string;
  totalCount: number;
  currentIndex: number;
  imageUrl: string | null;
  onPrev: () => void;
  onNext: () => void;
  onReupload: () => void;
  reuploadLabel: string;
  moreImagesTemplate: string;
  prevAria: string;
  nextAria: string;
}

export function ImageCompressPreview({
  fileName,
  totalCount,
  currentIndex,
  imageUrl,
  onPrev,
  onNext,
  onReupload,
  reuploadLabel,
  moreImagesTemplate,
  prevAria,
  nextAria,
}: ImageCompressPreviewProps) {
  const multi = totalCount > 1;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="truncate font-display text-[12px]"
            style={{ color: "var(--ink)" }}
          >
            {fileName}
          </span>
          {multi && (
            <span
              className="shrink-0 font-display text-[11px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {template(moreImagesTemplate, { n: totalCount - 1 })}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onReupload}
          className="shrink-0 rounded-[5px] border px-2.5 py-1 font-display text-[11px] transition-colors hover:border-[color:var(--accent-electric)]"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            color: "var(--ink-strong)",
          }}
        >
          {reuploadLabel}
        </button>
      </div>

      <div
        className="relative aspect-[4/3] w-full overflow-hidden rounded-[8px] border"
        style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt={fileName}
            className="absolute inset-0 size-full object-contain"
          />
        )}
      </div>

      {multi && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onPrev}
            disabled={currentIndex === 0}
            aria-label={prevAria}
            className="rounded-[5px] border p-1 transition-colors hover:border-[color:var(--accent-electric)] disabled:opacity-40"
            style={{
              background: "var(--surface-2)",
              borderColor: "var(--border)",
              color: "var(--ink-strong)",
            }}
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <span
            className="font-mono text-[11px]"
            style={{ color: "var(--ink-soft)" }}
          >
            {currentIndex + 1}/{totalCount}
          </span>
          <button
            type="button"
            onClick={onNext}
            disabled={currentIndex === totalCount - 1}
            aria-label={nextAria}
            className="rounded-[5px] border p-1 transition-colors hover:border-[color:var(--accent-electric)] disabled:opacity-40"
            style={{
              background: "var(--surface-2)",
              borderColor: "var(--border)",
              color: "var(--ink-strong)",
            }}
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
```

Note (trap a): the preview uses a fixed-aspect (`aspect-[4/3]`) `overflow-hidden` container with an absolutely-positioned `size-full object-contain` `<img>` — no inline px dimensions on a flex child, avoiding the Tailwind Preflight `img{height:auto}` asymmetry.

- [ ] **Step 2: Verify compile**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/image-compress/ImageCompressPreview.tsx
git commit -m "feat: add image-compress preview + carousel"
```

---

## Task 7: `ImageCompressResult`

**Files:**
- Create: `src/components/tools/image-compress/ImageCompressResult.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/tools/image-compress/ImageCompressResult.tsx
"use client";

import { DownloadIcon, RotateCcwIcon } from "lucide-react";

interface ImageCompressResultProps {
  doneTitle: string;
  settingsText: string;
  downloadLabel: string;
  recompressLabel: string;
  onDownload: () => void;
  onRecompress: () => void;
}

export function ImageCompressResult({
  doneTitle,
  settingsText,
  downloadLabel,
  recompressLabel,
  onDownload,
  onRecompress,
}: ImageCompressResultProps) {
  return (
    <div
      className="space-y-2 rounded-[8px] border p-3"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "inset 2px 0 0 var(--accent-electric)",
      }}
    >
      <div
        className="font-display text-[12px] font-semibold"
        style={{ color: "var(--headline)" }}
      >
        {doneTitle}
      </div>
      <div className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
        {settingsText}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onDownload}
          className="glint inline-flex h-8 items-center justify-start gap-1.5 rounded-[5px] px-3 font-display text-[11.5px] font-medium"
          style={{ background: "var(--accent-electric)", color: "#fff" }}
        >
          <DownloadIcon className="size-3" />
          {downloadLabel}
        </button>
        <button
          type="button"
          onClick={onRecompress}
          className="inline-flex h-8 items-center justify-start gap-1.5 rounded-[5px] border px-3 font-display text-[11.5px] transition-colors hover:border-[color:var(--accent-electric)]"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            color: "var(--ink-strong)",
          }}
        >
          <RotateCcwIcon className="size-3" />
          {recompressLabel}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compile**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/image-compress/ImageCompressResult.tsx
git commit -m "feat: add image-compress result card"
```

---

## Task 8: `ImageCompressTool` orchestrator

**Files:**
- Create: `src/components/tools/image-compress/ImageCompressTool.tsx`

Depends on Tasks 1, 3, 4, 5, 6, 7.

- [ ] **Step 1: Write the orchestrator**

```tsx
// src/components/tools/image-compress/ImageCompressTool.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ShrinkIcon, RotateCcwIcon } from "lucide-react";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { consumeStagedFiles } from "@/lib/common/toolHandoff";
import {
  compressImages,
  type CompressResult,
  type OutputFormat,
} from "@/lib/image/compressImage";
import { computeSavings } from "@/lib/image/computeSavings";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { template } from "@/lib/common/template";
import type { ImageCompressLabels } from "./labels";
import { ImageCompressPreview } from "./ImageCompressPreview";
import { ImageCompressControls } from "./ImageCompressControls";
import { ImageCompressFileList } from "./ImageCompressFileList";
import { ImageCompressResult } from "./ImageCompressResult";

const IMAGE_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

function formatLabel(format: OutputFormat): string {
  if (format === "image/jpeg") return "JPG";
  if (format === "image/png") return "PNG";
  return "WebP";
}

interface ImageCompressToolProps {
  labels: ImageCompressLabels;
  /** When mounted inline in Screen3Workspace, suppress the page-level card chrome. */
  inline?: boolean;
}

export function ImageCompressTool({
  labels,
  inline = false,
}: ImageCompressToolProps) {
  const [outputFormat, setOutputFormat] = useState<OutputFormat | null>(null);
  const [quality, setQuality] = useState(100);
  const [urls, setUrls] = useState<string[]>([]);
  const urlsRef = useRef<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [estimate, setEstimate] = useState<{ size: number; pct: number } | null>(
    null,
  );
  const [estimating, setEstimating] = useState(false);
  const estimateTokenRef = useRef(0);
  const reuploadInputRef = useRef<HTMLInputElement | null>(null);

  const {
    files,
    setFiles,
    status,
    progress,
    errorMessage,
    result,
    run,
    retry,
    download,
  } = useToolProcessor<CompressResult>({
    processor: (files, onProgress) => {
      if (!outputFormat) throw new Error("출력 형식을 선택해 주세요.");
      return compressImages({ files, quality, outputFormat, onProgress });
    },
    onDownload: (res) => {
      const mime =
        res.type === "zip" ? "application/zip" : outputFormat ?? "image/jpeg";
      downloadBlob(res.data, res.filename, mime);
    },
  });

  const revokeAll = useCallback(() => {
    for (const u of urlsRef.current) URL.revokeObjectURL(u);
    urlsRef.current = [];
  }, []);

  const handleFilesChange = useCallback(
    (newFiles: File[]) => {
      retry();
      revokeAll();
      const nextUrls = newFiles.map((f) => URL.createObjectURL(f));
      urlsRef.current = nextUrls;
      setUrls(nextUrls);
      setFiles(newFiles);
      setCurrentIndex(0);
      setEstimate(null);
    },
    [retry, revokeAll, setFiles],
  );

  // Consume cross-tool handoff (e.g. files staged by image-resize). Once on mount.
  useEffect(() => {
    const staged = consumeStagedFiles();
    if (staged && staged.files.length > 0) handleFilesChange(staged.files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke all object URLs on unmount.
  useEffect(() => () => revokeAll(), [revokeAll]);

  // Live estimated output size for the currently previewed image.
  useEffect(() => {
    if (
      !outputFormat ||
      outputFormat === "image/png" ||
      files.length === 0 ||
      status !== "idle"
    ) {
      setEstimate(null);
      setEstimating(false);
      return;
    }
    const file = files[currentIndex];
    if (!file) return;
    const token = ++estimateTokenRef.current;
    setEstimating(true);
    const timer = setTimeout(async () => {
      try {
        const res = await compressImages({ files: [file], quality, outputFormat });
        if (token !== estimateTokenRef.current) return;
        const img = res.images[0];
        const { pct } = computeSavings(img.originalSize, img.compressedSize);
        setEstimate({ size: img.compressedSize, pct });
      } catch {
        if (token === estimateTokenRef.current) setEstimate(null);
      } finally {
        if (token === estimateTokenRef.current) setEstimating(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [outputFormat, quality, currentIndex, files, status]);

  const handleRemove = useCallback(
    (index: number) => {
      const removed = urlsRef.current[index];
      if (removed) URL.revokeObjectURL(removed);
      const nextUrls = urlsRef.current.filter((_, i) => i !== index);
      urlsRef.current = nextUrls;
      setUrls(nextUrls);
      const nextFiles = files.filter((_, i) => i !== index);
      setFiles(nextFiles);
      setCurrentIndex((idx) =>
        Math.max(0, Math.min(idx, nextFiles.length - 1)),
      );
    },
    [files, setFiles],
  );

  const handleReupload = useCallback(
    () => reuploadInputRef.current?.click(),
    [],
  );

  const handleHiddenInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newFiles = e.target.files ? Array.from(e.target.files) : [];
      if (newFiles.length > 0) handleFilesChange(newFiles);
      e.target.value = "";
    },
    [handleFilesChange],
  );

  const onReset = useCallback(() => {
    handleFilesChange([]);
    setOutputFormat(null);
    setQuality(100);
  }, [handleFilesChange]);

  const hasFiles = files.length > 0;
  const isDone = status === "done" && !!result;

  const body = (
    <div className={inline ? "space-y-5" : "space-y-5 px-6 py-4"}>
      <input
        ref={reuploadInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleHiddenInputChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {!hasFiles ? (
        <FileUpload
          accept={IMAGE_ACCEPT}
          multiple
          hideFileList
          onFiles={handleFilesChange}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={{ maxSize: labels.uploadMaxSize }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <ImageCompressPreview
            fileName={files[currentIndex]?.name ?? ""}
            totalCount={files.length}
            currentIndex={currentIndex}
            imageUrl={urls[currentIndex] ?? null}
            onPrev={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            onNext={() =>
              setCurrentIndex((i) => Math.min(files.length - 1, i + 1))
            }
            onReupload={handleReupload}
            reuploadLabel={labels.reupload}
            moreImagesTemplate={labels.moreImagesTemplate}
            prevAria={labels.prevAria}
            nextAria={labels.nextAria}
          />

          <div className="space-y-3">
            <div style={{ minHeight: "188px" }}>
              {isDone ? (
                <ImageCompressResult
                  doneTitle={labels.doneTitle}
                  settingsText={template(labels.settingsTemplate, {
                    format: outputFormat ? formatLabel(outputFormat) : "",
                    quality,
                  })}
                  downloadLabel={labels.download}
                  recompressLabel={labels.recompress}
                  onDownload={download}
                  onRecompress={retry}
                />
              ) : status === "idle" ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={run}
                    disabled={!outputFormat}
                    className="glint inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[5px] px-3 font-display text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: "var(--accent-electric)", color: "#fff" }}
                  >
                    {template(labels.compressTemplate, { n: files.length })}
                  </button>
                  <ImageCompressControls
                    formatTitle={labels.formatTitle}
                    qualityTitle={labels.qualityTitle}
                    outputFormat={outputFormat}
                    onSelectFormat={setOutputFormat}
                    quality={quality}
                    onQualityChange={setQuality}
                    estimate={estimate}
                    estimating={estimating}
                    estimateTemplate={labels.estimateTemplate}
                    estimatingLabel={labels.estimating}
                    pngLosslessLabel={labels.pngLossless}
                  />
                </div>
              ) : (
                <ProcessingStatus
                  status={status}
                  progress={progress}
                  errorMessage={errorMessage}
                  onRetry={retry}
                />
              )}
            </div>

            <ImageCompressFileList
              mode={isDone ? "done" : "idle"}
              idleFiles={files.map((f) => ({ name: f.name, size: f.size }))}
              doneResults={
                result?.images.map((img) => ({
                  name: img.name,
                  originalSize: img.originalSize,
                  compressedSize: img.compressedSize,
                })) ?? []
              }
              onRemove={handleRemove}
              removeAriaTemplate={labels.removeAria}
              sizeChangeTemplate={labels.sizeChangeTemplate}
            />
          </div>
        </div>
      )}
    </div>
  );

  if (inline) return body;

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-[14px] border"
      style={{
        background: "color-mix(in oklch, var(--surface) 92%, transparent)",
        backdropFilter: "blur(10px) saturate(1.1)",
        WebkitBackdropFilter: "blur(10px) saturate(1.1)",
        borderColor: "var(--border)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 48px -16px rgba(20,30,60,0.28), 0 8px 20px -6px rgba(20,30,60,0.16)",
      }}
    >
      <button
        type="button"
        onClick={onReset}
        aria-label={labels.header.reset}
        title={labels.header.reset}
        className="absolute right-6 top-4 z-10 rounded-md p-1.5 transition-colors hover:text-[color:var(--ink-strong)]"
        style={{ color: "var(--ink-soft)" }}
      >
        <RotateCcwIcon className="size-4" />
      </button>
      <div
        className="flex items-start gap-3 border-b px-6 pt-3 pb-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-[5px]"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--ink-strong)",
          }}
        >
          <ShrinkIcon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="font-display text-[16px] font-semibold leading-[1.2] tracking-[0.005em] font-ko"
            style={{ color: "var(--headline)" }}
          >
            {labels.header.title}
          </div>
          <div
            className="mt-1 font-body text-[12px] leading-[1.45]"
            style={{ color: "var(--ink)" }}
          >
            {labels.header.description}
          </div>
        </div>
      </div>
      {body}
    </div>
  );
}
```

Notes:
- `outputFormat` starts `null` → the compress button is `disabled` until a format is picked (requirement).
- `onRecompress={retry}` clears only result/status; `outputFormat` + `quality` persist (separate state), so the user returns to the exact pre-compress state.
- The PNG branch in the estimate effect skips the (quality-independent) re-encode; the PNG note is shown by `ImageCompressControls` purely from `outputFormat`.
- `minHeight: "188px"` reserves the right-column action region so the file list does not shift between idle / processing / done (UI stability). Magic number → polish backlog.
- The done-mode list is read-only: `ImageCompressFileList` only renders the remove button in `idle` mode, so `handleRemove` is unreachable once results exist.

- [ ] **Step 2: Verify compile**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/image-compress/ImageCompressTool.tsx
git commit -m "feat: add image-compress orchestrator with live estimate"
```

---

## Task 9: Rewrite `page.tsx` (server component)

**Files:**
- Modify (full replace): `src/app/[lang]/(chrome)/tools/image-compress/page.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
// src/app/[lang]/(chrome)/tools/image-compress/page.tsx
import { getDictionary, type Locale } from "@/i18n/config";
import { locales } from "@/i18n/locales";
import { ImageCompressTool } from "@/components/tools/image-compress/ImageCompressTool";
import { getImageCompressLabels } from "@/components/tools/image-compress/labels";

interface PageProps {
  params: Promise<{ lang: string }>;
}

function asLocale(lang: string): Locale {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : "ko";
}

export default async function ImageCompressPage({ params }: PageProps) {
  const { lang } = await params;
  const dict = await getDictionary(asLocale(lang));
  const labels = getImageCompressLabels(dict);

  return (
    <div
      className="mx-auto px-4 py-8"
      style={{
        width: "min(var(--tweak-workspace-width, 980px), calc(100vw - 32px))",
      }}
    >
      <ImageCompressTool labels={labels} />
    </div>
  );
}
```

Note: this removes the old client `"use client"` body entirely; the consume-side handoff `useEffect` now lives in `ImageCompressTool` (do not duplicate it here).

- [ ] **Step 2: Verify compile**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[lang]/(chrome)/tools/image-compress/page.tsx"
git commit -m "feat: render image-compress via silver ImageCompressTool"
```

---

## Task 10: Screen3Workspace — ternary→switch + inline branch

**Files:**
- Modify: `src/components/landing/Screen3Workspace.tsx`

- [ ] **Step 1: Add the import**

Add alongside the existing tool imports (after the `getImageResizeLabels` import near the top):
```tsx
import { ImageCompressTool } from "@/components/tools/image-compress/ImageCompressTool";
import { getImageCompressLabels } from "@/components/tools/image-compress/labels";
```

- [ ] **Step 2: Add a `renderToolBody` helper inside the component**

Inside `Screen3Workspace`, just before the `return (`, add:
```tsx
  const renderToolBody = () => {
    switch (tool.slug) {
      case "ppt-background":
        return (
          <PptBackgroundTool
            key={pptBgResetKey}
            inline
            labels={getPptBackgroundLabels(dict)}
          />
        );
      case "image-resize":
        return (
          <ImageResizeTool inline labels={getImageResizeLabels(dict)} lang={locale} />
        );
      case "image-compress":
        return <ImageCompressTool inline labels={getImageCompressLabels(dict)} />;
      default:
        return (
          <>
            <Link
              href={toolHref}
              className="rounded-[8px] border-2 border-dashed px-6 py-7 flex flex-col items-center justify-center text-center transition-colors hover:border-[color:var(--accent-electric)]"
              style={{
                borderColor: "var(--hairline)",
                background: "var(--surface-2)",
              }}
            >
              <div
                className="w-10 h-10 rounded-[4px] flex items-center justify-center mb-2.5"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--ink-strong)",
                }}
              >
                <UploadCloud size={16} />
              </div>
              <div
                className="font-display text-[14px] font-semibold leading-[1.2] font-ko"
                style={{ color: "var(--headline)" }}
              >
                {dict.common.drop}
              </div>
              <div
                className="mt-0.5 font-body text-[11px]"
                style={{ color: "var(--ink-soft)" }}
              >
                {dict.common.click}
              </div>

              <span
                className="mt-4 inline-flex items-center gap-2 px-6 h-11 rounded-[5px] font-display text-[13.5px] font-medium tracking-[0.02em] focus-ring glint"
                style={{
                  background: "var(--accent-electric)",
                  color: "#fff",
                  boxShadow:
                    "0 1px 0 rgba(255,255,255,0.2) inset, 0 1px 2px rgba(20,30,60,0.15), 0 6px 16px -6px color-mix(in oklch, var(--accent-electric) 60%, transparent)",
                }}
              >
                <UploadCloud size={14} />
                <span>{dict.common.openTool}</span>
              </span>
            </Link>

            <div
              className="mt-4 flex items-center justify-center gap-4 font-body text-[9.5px] tracking-[0.15em] uppercase"
              style={{ color: "var(--ink-soft)" }}
            >
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={10} /> {dict.status.inBrowser}
              </span>
              <span style={{ background: "var(--border)" }} className="w-px h-3" />
              <span className="flex items-center gap-1.5">
                <InfinityIcon size={10} /> {dict.status.unlimited}
              </span>
              <span style={{ background: "var(--border)" }} className="w-px h-3" />
              <span className="flex items-center gap-1.5">
                <Zap size={10} /> {dict.status.noUpload}
              </span>
            </div>
          </>
        );
    }
  };
```

- [ ] **Step 3: Replace the inline chained-ternary with the helper call**

Find the `<div className="px-6 py-3">` block that currently contains
`{tool.slug === "ppt-background" ? (...) : tool.slug === "image-resize" ? (...) : (...)}`
and replace its inner expression with:
```tsx
              <div className="px-6 py-3">{renderToolBody()}</div>
```
(The ppt-background-only reset `<button>` in the card header above this div stays unchanged.)

- [ ] **Step 4: Verify compile + build**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no unused-import errors — `Link`, `UploadCloud`, `ShieldCheck`, `InfinityIcon`, `Zap` are all still used inside the `default` branch).

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/Screen3Workspace.tsx
git commit -m "refactor: Screen3 inline-tool ternary to switch + add image-compress"
```

---

## Task 11: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Type check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 2: Unit tests**

Run: `pnpm test`
Expected: PASS — previous 43 tests + 4 new `computeSavings` tests = 47.

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: build succeeds with no type/lint errors; `/[lang]/tools/image-compress` route compiles.

- [ ] **Step 4: Hand off for manual visual + e2e verification**

Report to the user for manual verification (dev server is user-run):
- Single image: upload → preview, format-required gate (compress disabled until a format is chosen), quality slider + live estimate updates, compress → result card + done-mode list (new ext + `orig → new`), `다시 압축` returns to pre-compress state.
- Multi image: `+n개 이미지` suffix, `← i/n →` carousel, `({n}개)` on the button, long list scrolls without growing the tool, file list position holds steady idle↔done.
- PNG selected: shows the lossless note, no estimate spinner.
- Page route (`/ko/tools/image-compress`, `/en/tools/image-compress`) and Screen3 inline mount both render; EN locale shows no KO leakage.
- Handoff e2e: in image-resize, click `압축/변환하러 가기` → image-compress loads with the staged file auto-populated and controls shown.

- [ ] **Step 5: Commit (only if verification surfaced fixes)**

If fixes were needed, commit them with descriptive messages. Otherwise no commit.

---

## Self-Review

**Spec coverage:**
- §2 layout (2-col, preview+carousel | controls+list) → Tasks 6, 5, 4, 8. ✓
- §3 behavior: re-upload picker → Task 8 (hidden input); format-required gate → Task 8 (`disabled={!outputFormat}`); quality 10–100 default 100 → Tasks 5/8; compress→result-card swap with list held in place → Task 8 (minHeight region); done-mode rows new-ext + orig→new → Tasks 4/8; result card content → Task 7; recompress → pre-compress state → Task 8; multi-file indicators → Tasks 6/8; read-only done list → Task 4; consume handoff preserved → Task 8. ✓
- §4 UI stability (reserved region, reserved estimate line, box-shadow indicator, scroll list) → Tasks 8, 5, 4. ✓
- §5 live estimate (debounce, token race-guard, PNG note, idle-only) → Tasks 8, 5, 1. ✓
- §6 component breakdown + computeSavings TDD → Tasks 1, 3–8. ✓
- §7 page.tsx → Task 9. ✓
- §8 Screen3 switch refactor + branch → Task 10. ✓
- §9 i18n KO+EN → Task 2. ✓
- §10 testing/verification → Tasks 1, 11. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command shows expected output. ✓

**Type consistency:** `OutputFormat | null` used consistently (Tasks 5, 8). `computeSavings` returns `{ saved, pct }` (Task 1) and only `pct` is consumed in Task 8. `ImageCompressLabels` field names in Task 3 match every consumer prop in Tasks 4–9. `estimate` shape `{ size, pct }` consistent between Task 8 (producer) and Task 5 (consumer). `compressImages` / `CompressResult` / `CompressedImage` (`name`, `originalSize`, `compressedSize`) match the existing `compressImage.ts`. ✓
