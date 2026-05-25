# pdf-to-image Silver Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `pdf-to-image` to the silver design as a dedicated tool — pdf-arrange-style editable input grid (rotate/delete, multi-PDF, no divider/reorder) + format/DPI choice, converting to an image-to-pdf-style result screen (3-column image grid + action card with ZIP download, image-compress handoff, back).

**Architecture:** Reuse the `components/pdf-editor/` module (`PageItemCard`, `useLazyThumbnail`, `thumbnailCache`, `buildPageItems`) and `useToolProcessor`. Pure naming/job-building logic is TDD'd in `lib/pdf/`; pdfjs rendering is rewritten in `pdfToImage.ts` (browser-verified). New tool components live in `components/tools/pdf-to-image/`. A single fixed 52vh envelope spans all states.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind v4, pdfjs-dist (self-hosted), pdf-lib (via buildPageItems), JSZip, vitest (node env), Biome.

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/components/pdf-editor/PageItemCard.tsx` | shared page card | Modify — add `draggable?` prop |
| `src/lib/pdf/pdfToImageNaming.ts` | output filename rules (pure) | Create |
| `src/lib/pdf/pdfToImageNaming.test.ts` | naming tests | Create |
| `src/lib/pdf/buildConversionJobs.ts` | PageItem[] → jobs (pure) | Create |
| `src/lib/pdf/buildConversionJobs.test.ts` | job tests | Create |
| `src/lib/pdf/pdfToImage.ts` | pdfjs render → images | Rewrite |
| `src/i18n/dictionaries/ko.json` | KO copy | Modify — add `page` block |
| `src/i18n/dictionaries/en.json` | EN copy | Modify — expand entry |
| `src/components/tools/pdf-to-image/labels.ts` | dict → labels mapper | Create |
| `src/components/tools/pdf-to-image/PdfToImageTopStrip.tsx` | file summary + reupload + convert | Create |
| `src/components/tools/pdf-to-image/PdfToImageControls.tsx` | format + DPI toggles | Create |
| `src/components/tools/pdf-to-image/PdfToImageResult.tsx` | 3-col result grid + action card | Create |
| `src/components/tools/pdf-to-image/PdfToImage.tsx` | tool orchestrator | Create |
| `src/app/[lang]/(chrome)/tools/pdf-to-image/page.tsx` | route | Rewrite |
| `src/components/landing/Screen3Workspace.tsx` | inline mount | Modify — add case |

---

## Task 1: Add `draggable` prop to PageItemCard (shared, backwards-compatible)

**Files:**
- Modify: `src/components/pdf-editor/PageItemCard.tsx`

pdf-to-image has no reorder, so the inherited `cursor-grab` would mislead. Add an opt-out that defaults to current behavior.

- [ ] **Step 1: Add the prop to the interface**

In `PageItemCardProps` (after `pageAspect?`), add:

```tsx
  /**
   * When false, omit the grab cursor (a non-reorderable grid like pdf-to-image).
   * Default true preserves pdf-arrange / image-to-pdf behavior.
   */
  draggable?: boolean;
```

- [ ] **Step 2: Destructure with default**

In `PageItemCardImpl({ ... })`, add `draggable = true,` to the destructured params (e.g. after `pageAspect = null,`).

- [ ] **Step 3: Apply conditionally to the root className**

Replace the root `<div>`'s className:

```tsx
      className="group relative my-[9px] h-[204px] w-[150px] cursor-grab overflow-hidden rounded-[5px] active:cursor-grabbing"
```

with:

```tsx
      className={`group relative my-[9px] h-[204px] w-[150px] overflow-hidden rounded-[5px] ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no new errors). pdf-arrange / image-to-pdf still pass `draggable` implicitly as `true`.

- [ ] **Step 5: Commit**

```bash
git add src/components/pdf-editor/PageItemCard.tsx
git commit -m "feat(pdf-editor): add backwards-compatible draggable prop to PageItemCard"
```

---

## Task 2: Output filename rules (pure, TDD)

**Files:**
- Create: `src/lib/pdf/pdfToImageNaming.ts`
- Test: `src/lib/pdf/pdfToImageNaming.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/pdfToImageNaming.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveImageName, deriveZipName } from "./pdfToImageNaming";

describe("deriveImageName", () => {
  it("zero-pads the ordinal to the total's digit width", () => {
    expect(deriveImageName("report", 1, 12, "jpg")).toBe("report-01.jpg");
    expect(deriveImageName("report", 10, 12, "jpg")).toBe("report-10.jpg");
  });

  it("uses no padding when total is single-digit", () => {
    expect(deriveImageName("report", 5, 5, "png")).toBe("report-5.png");
  });

  it("pads to three digits for 100+ pages", () => {
    expect(deriveImageName("a", 7, 100, "jpg")).toBe("a-007.jpg");
  });

  it("uses the given extension", () => {
    expect(deriveImageName("doc", 1, 1, "png")).toBe("doc-1.png");
  });
});

describe("deriveZipName", () => {
  it("appends -images.zip to the base", () => {
    expect(deriveZipName("report")).toBe("report-images.zip");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/pdf/pdfToImageNaming.test.ts`
Expected: FAIL — "Failed to resolve import './pdfToImageNaming'".

- [ ] **Step 3: Write the implementation**

Create `src/lib/pdf/pdfToImageNaming.ts`:

```ts
// Pure output-filename rules for pdf-to-image. No DOM/pdfjs — unit-testable.

/**
 * Per-image output name: `{base}-{NN}.{ext}`, the 1-based `index` zero-padded to
 * the digit width of `total` so files sort naturally (page 2 before page 10).
 */
export function deriveImageName(
  base: string,
  index: number,
  total: number,
  ext: string,
): string {
  const width = String(Math.max(1, total)).length;
  const num = String(index).padStart(width, "0");
  return `${base}-${num}.${ext}`;
}

/** Zip name when multiple images are produced. */
export function deriveZipName(base: string): string {
  return `${base}-images.zip`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/pdf/pdfToImageNaming.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/pdfToImageNaming.ts src/lib/pdf/pdfToImageNaming.test.ts
git commit -m "feat(pdf-to-image): pure output-name rules with TDD"
```

---

## Task 3: Build conversion jobs from the page model (pure, TDD)

**Files:**
- Create: `src/lib/pdf/buildConversionJobs.ts`
- Test: `src/lib/pdf/buildConversionJobs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/buildConversionJobs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildConversionJobs } from "./buildConversionJobs";
import type { PageItem } from "./pageItem";

function page(over: Partial<PageItem>): PageItem {
  return {
    id: over.id ?? crypto.randomUUID(),
    sourceFileId: over.sourceFileId ?? "f1",
    sourceFileName: over.sourceFileName ?? "a.pdf",
    kind: over.kind ?? "pdf",
    sourcePageIndex: over.sourcePageIndex ?? 0,
    rotation: over.rotation ?? 0,
    splitAfter: over.splitAfter ?? false,
    deleted: over.deleted ?? false,
  };
}

describe("buildConversionJobs", () => {
  it("maps non-deleted pages to jobs in order", () => {
    const jobs = buildConversionJobs([
      page({ sourceFileId: "f1", sourcePageIndex: 0 }),
      page({ sourceFileId: "f1", sourcePageIndex: 1 }),
      page({ sourceFileId: "f2", sourcePageIndex: 0 }),
    ]);
    expect(jobs).toEqual([
      { sourceFileId: "f1", sourcePageIndex: 0, rotation: 0 },
      { sourceFileId: "f1", sourcePageIndex: 1, rotation: 0 },
      { sourceFileId: "f2", sourcePageIndex: 0, rotation: 0 },
    ]);
  });

  it("drops deleted pages", () => {
    const jobs = buildConversionJobs([
      page({ sourcePageIndex: 0 }),
      page({ sourcePageIndex: 1, deleted: true }),
      page({ sourcePageIndex: 2 }),
    ]);
    expect(jobs.map((j) => j.sourcePageIndex)).toEqual([0, 2]);
  });

  it("carries rotation", () => {
    const jobs = buildConversionJobs([page({ rotation: 90 })]);
    expect(jobs[0].rotation).toBe(90);
  });

  it("returns empty for no input or all-deleted", () => {
    expect(buildConversionJobs([])).toEqual([]);
    expect(buildConversionJobs([page({ deleted: true })])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/pdf/buildConversionJobs.test.ts`
Expected: FAIL — "Failed to resolve import './buildConversionJobs'".

- [ ] **Step 3: Write the implementation**

Create `src/lib/pdf/buildConversionJobs.ts`:

```ts
// Pure: turn the editor's page model into an ordered list of render jobs.
// No pdfjs/DOM here so it stays unit-testable.

import type { PageItem } from "./pageItem";

export interface ConversionJob {
  sourceFileId: string;
  sourcePageIndex: number;
  /** Clockwise rotation applied on render (0|90|180|270). */
  rotation: number;
}

/** Non-deleted pages, in order, as render jobs. */
export function buildConversionJobs(items: PageItem[]): ConversionJob[] {
  return items
    .filter((p) => !p.deleted)
    .map((p) => ({
      sourceFileId: p.sourceFileId,
      sourcePageIndex: p.sourcePageIndex,
      rotation: p.rotation,
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/pdf/buildConversionJobs.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/buildConversionJobs.ts src/lib/pdf/buildConversionJobs.test.ts
git commit -m "feat(pdf-to-image): pure conversion-job builder with TDD"
```

---

## Task 4: Rewrite pdfToImage.ts to accept the edited page model

**Files:**
- Rewrite: `src/lib/pdf/pdfToImage.ts`

Renders only non-deleted pages (jobs), applies rotation, handles multiple source PDFs (one cached pdfjs doc per file), names outputs from the base. Canvas-bound → browser-verified, no node test.

- [ ] **Step 1: Replace the file contents**

Replace `src/lib/pdf/pdfToImage.ts` entirely with:

```ts
import type { PDFDocumentProxy } from "pdfjs-dist";
import { getPdfjsLib, pdfjsDocParams } from "./pdfjs";
import { deriveImageName } from "./pdfToImageNaming";
import type { ConversionJob } from "./buildConversionJobs";

export type OutputFormat = "image/jpeg" | "image/png";
export type DpiOption = 72 | 150 | 300;

export interface ConvertedImage {
  name: string;
  blob: Blob;
}

export interface PdfToImageOptions {
  jobs: ConversionJob[];
  /** Raw source bytes per file id (shared with the thumbnail cache). */
  sourceBytesById: Map<string, Uint8Array>;
  format: OutputFormat;
  dpi: DpiOption;
  /** Output base name (first uploaded file, sans ext). */
  baseName: string;
  onProgress?: (pct: number) => void;
}

const PDF_BASE_DPI = 72;

/**
 * Render each job (one source page) to an image. Pages are rendered in job order
 * across possibly several source PDFs; each pdfjs document is opened once and
 * reused. Rotation is the page's intrinsic rotation plus the user's edit.
 */
export async function pdfToImages({
  jobs,
  sourceBytesById,
  format,
  dpi,
  baseName,
  onProgress,
}: PdfToImageOptions): Promise<ConvertedImage[]> {
  if (jobs.length === 0) throw new Error("변환할 페이지가 없습니다.");

  const pdfjsLib = await getPdfjsLib();
  const docCache = new Map<string, PDFDocumentProxy>();

  const getDoc = async (fileId: string): Promise<PDFDocumentProxy> => {
    let doc = docCache.get(fileId);
    if (!doc) {
      const bytes = sourceBytesById.get(fileId);
      if (!bytes) throw new Error("소스 PDF를 찾을 수 없습니다.");
      // slice() → fresh buffer pdfjs may detach without harming the shared
      // bytes the live thumbnail cache still reads from (trap i).
      doc = await pdfjsLib.getDocument({ data: bytes.slice(), ...pdfjsDocParams })
        .promise;
      docCache.set(fileId, doc);
    }
    return doc;
  };

  const scale = dpi / PDF_BASE_DPI;
  const ext = format === "image/png" ? "png" : "jpg";
  const quality = format === "image/jpeg" ? 0.92 : undefined;
  const total = jobs.length;
  const images: ConvertedImage[] = [];

  try {
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const doc = await getDoc(job.sourceFileId);
      const page = await doc.getPage(job.sourcePageIndex + 1);
      // Match the thumbnail (rendered at page.rotate) + the card's CSS rotate.
      const rotation = (page.rotate + job.rotation) % 360;
      const viewport = page.getViewport({ scale, rotation });

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D 컨텍스트를 만들 수 없습니다.");

      await page.render({ canvas, viewport }).promise;

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Canvas → Blob 변환 실패"))),
          format,
          quality,
        );
      });

      images.push({
        name: deriveImageName(baseName, i + 1, total, ext),
        blob,
      });

      // Release the canvas backing store immediately (OOM guard for big PDFs).
      canvas.width = 0;
      canvas.height = 0;
      onProgress?.(Math.round(((i + 1) / total) * 100));
    }
  } finally {
    for (const doc of docCache.values()) doc.destroy();
  }

  return images;
}
```

- [ ] **Step 2: Typecheck (expect errors only in the old page.tsx consumer)**

Run: `pnpm exec tsc --noEmit`
Expected: Errors ONLY in `src/app/[lang]/(chrome)/tools/pdf-to-image/page.tsx` (old call shape `pdfToImages({ file, format, dpi })`). These are fixed in Task 9. No errors elsewhere.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pdf/pdfToImage.ts
git commit -m "feat(pdf-to-image): render edited page model (rotation, multi-source, named outputs)"
```

---

## Task 5: i18n copy + labels mapper

**Files:**
- Modify: `src/i18n/dictionaries/ko.json`
- Modify: `src/i18n/dictionaries/en.json`
- Create: `src/components/tools/pdf-to-image/labels.ts`

- [ ] **Step 1: Expand the KO entry**

In `src/i18n/dictionaries/ko.json`, replace the line:

```json
    "pdf-to-image": { "title": "PDF → 이미지", "description": "PDF의 각 페이지를 고해상도 이미지로 변환합니다." },
```

with:

```json
    "pdf-to-image": {
      "title": "PDF → 이미지",
      "description": "PDF의 각 페이지를 고해상도 이미지로 변환합니다.",
      "page": {
        "uploadPrompt": "PDF를 드래그하거나 클릭하여 업로드",
        "uploadHint": "PDF 여러 개를 한 번에 올릴 수 있어요.",
        "uploadMaxSize": "파일당 최대 {size}",
        "reupload": "다시 업로드",
        "addAria": "PDF 추가",
        "convert": "이미지로 변환 ({n}장)",
        "filesOne": "{name}",
        "filesMany": "{name} 외 {rest}개",
        "rotateAria": "회전",
        "deleteAria": "삭제",
        "processing": "변환 중…",
        "formatLabel": "이미지 형식",
        "formatJpg": "JPG",
        "formatPng": "PNG",
        "dpiLabel": "해상도",
        "dpi72": "72 DPI",
        "dpi150": "150 DPI",
        "dpi300": "300 DPI",
        "dpiHint": "고해상도(300 DPI)는 페이지가 많은 PDF에서 메모리를 많이 사용할 수 있어요.",
        "resultTitle": "변환 완료",
        "imageCount": "{n}장",
        "download": "전체 다운로드 (ZIP)",
        "downloadOneAria": "{name} 다운로드",
        "compressHandoff": "이미지 압축하기",
        "again": "다시"
      }
    },
```

- [ ] **Step 2: Expand the EN entry**

In `src/i18n/dictionaries/en.json`, replace the line:

```json
    "pdf-to-image": { "title": "PDF → Image", "description": "Render each page as a high-res image." },
```

with:

```json
    "pdf-to-image": {
      "title": "PDF → Image",
      "description": "Render each page as a high-res image.",
      "page": {
        "uploadPrompt": "Drag or click to upload a PDF",
        "uploadHint": "You can add several PDFs at once.",
        "uploadMaxSize": "Up to {size} per file",
        "reupload": "Re-upload",
        "addAria": "Add PDF",
        "convert": "Convert to images ({n})",
        "filesOne": "{name}",
        "filesMany": "{name} +{rest} more",
        "rotateAria": "Rotate",
        "deleteAria": "Delete",
        "processing": "Converting…",
        "formatLabel": "Image format",
        "formatJpg": "JPG",
        "formatPng": "PNG",
        "dpiLabel": "Resolution",
        "dpi72": "72 DPI",
        "dpi150": "150 DPI",
        "dpi300": "300 DPI",
        "dpiHint": "High resolution (300 DPI) can use a lot of memory on long PDFs.",
        "resultTitle": "Conversion complete",
        "imageCount": "{n} images",
        "download": "Download all (ZIP)",
        "downloadOneAria": "Download {name}",
        "compressHandoff": "Compress images",
        "again": "Again"
      }
    },
```

- [ ] **Step 3: Create the labels mapper**

Create `src/components/tools/pdf-to-image/labels.ts`:

```ts
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
  resultTitle: string;
  imageCountTemplate: string;
  download: string;
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
    resultTitle: p.resultTitle,
    imageCountTemplate: p.imageCount,
    download: p.download,
    downloadOneAria: p.downloadOneAria,
    compressHandoff: p.compressHandoff,
    again: p.again,
  };
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: Errors remain ONLY in the old `pdf-to-image/page.tsx` (Task 9). `labels.ts` resolves cleanly against the new `page` keys (the `Dictionary` type derives from ko.json).

- [ ] **Step 5: Commit**

```bash
git add src/i18n/dictionaries/ko.json src/i18n/dictionaries/en.json src/components/tools/pdf-to-image/labels.ts
git commit -m "feat(pdf-to-image): page-level i18n copy (ko/en) + labels mapper"
```

---

## Task 6: PdfToImageTopStrip component

**Files:**
- Create: `src/components/tools/pdf-to-image/PdfToImageTopStrip.tsx`

File summary + re-upload + convert (mirrors ImageToPdfTopStrip).

- [ ] **Step 1: Create the component**

Create `src/components/tools/pdf-to-image/PdfToImageTopStrip.tsx`:

```tsx
"use client";

interface PdfToImageTopStripProps {
  filesSummary: string;
  onReupload: () => void;
  reuploadLabel: string;
  onConvert: () => void;
  convertLabel: string;
  convertDisabled: boolean;
  busy: boolean;
}

const NP =
  "nameplate inline-flex h-9 items-center gap-1.5 rounded-[9px] px-3 text-[13px] disabled:cursor-not-allowed disabled:opacity-50";

export function PdfToImageTopStrip({
  filesSummary,
  onReupload,
  reuploadLabel,
  onConvert,
  convertLabel,
  convertDisabled,
  busy,
}: PdfToImageTopStripProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`${NP} min-w-0`} style={{ color: "var(--ink-strong)" }}>
          <span className="truncate">{filesSummary}</span>
        </span>
        <button type="button" className={NP} onClick={onReupload} disabled={busy}>
          {reuploadLabel}
        </button>
      </div>

      <button
        type="button"
        onClick={onConvert}
        disabled={convertDisabled || busy}
        className="btn-primary glint inline-flex h-9 min-w-[140px] items-center justify-center gap-1.5 rounded-[9px] px-4 text-[13px] font-semibold tabular-nums disabled:cursor-not-allowed disabled:opacity-50"
      >
        {convertLabel}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: No new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/pdf-to-image/PdfToImageTopStrip.tsx
git commit -m "feat(pdf-to-image): top strip (file summary + reupload + convert)"
```

---

## Task 7: PdfToImageControls component (format + DPI toggles)

**Files:**
- Create: `src/components/tools/pdf-to-image/PdfToImageControls.tsx`

Two `.nameplate[data-active]` toggle groups + the 300-DPI hint. Mirrors PageSizeSelector's toggle pattern.

- [ ] **Step 1: Create the component**

Create `src/components/tools/pdf-to-image/PdfToImageControls.tsx`:

```tsx
"use client";

import type { DpiOption, OutputFormat } from "@/lib/pdf/pdfToImage";
import type { PdfToImageLabels } from "./labels";

interface PdfToImageControlsProps {
  format: OutputFormat;
  dpi: DpiOption;
  onFormatChange: (format: OutputFormat) => void;
  onDpiChange: (dpi: DpiOption) => void;
  labels: PdfToImageLabels;
}

const TOGGLE =
  "nameplate h-8 flex-1 rounded-[9px] px-3 font-display text-[12px] font-medium";
const GROUP_LABEL =
  "font-display text-[11px] font-medium uppercase tracking-[0.08em]";

export function PdfToImageControls({
  format,
  dpi,
  onFormatChange,
  onDpiChange,
  labels,
}: PdfToImageControlsProps) {
  const formats: { value: OutputFormat; label: string }[] = [
    { value: "image/jpeg", label: labels.formatJpg },
    { value: "image/png", label: labels.formatPng },
  ];
  const dpis: { value: DpiOption; label: string }[] = [
    { value: 72, label: labels.dpi72 },
    { value: 150, label: labels.dpi150 },
    { value: 300, label: labels.dpi300 },
  ];

  return (
    <div className="flex flex-wrap gap-4">
      <div className="min-w-[160px] flex-1 space-y-2">
        <p className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
          {labels.formatLabel}
        </p>
        <div className="flex gap-1.5">
          {formats.map((opt) => {
            const active = format === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onFormatChange(opt.value)}
                data-active={active}
                className={TOGGLE}
                style={active ? undefined : { color: "var(--ink-strong)" }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-[220px] flex-[2] space-y-2">
        <p className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
          {labels.dpiLabel}
        </p>
        <div className="flex gap-1.5">
          {dpis.map((opt) => {
            const active = dpi === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onDpiChange(opt.value)}
                data-active={active}
                className={TOGGLE}
                style={active ? undefined : { color: "var(--ink-strong)" }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {dpi === 300 && (
          <p className="font-body text-[11px]" style={{ color: "var(--accent-copper)" }}>
            {labels.dpiHint}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: No new errors from this file (imports `OutputFormat`/`DpiOption` from the rewritten `pdfToImage.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/pdf-to-image/PdfToImageControls.tsx
git commit -m "feat(pdf-to-image): format + DPI toggle controls"
```

---

## Task 8: PdfToImageResult component (3-col grid + action card)

**Files:**
- Create: `src/components/tools/pdf-to-image/PdfToImageResult.tsx`

Left: 3-column grid of result images (object URLs, StrictMode-safe), each a `group` with hover overlays (number badge, filename+size strip, per-image download). Right: action card (ZIP download, image-compress handoff, again).

- [ ] **Step 1: Create the component**

Create `src/components/tools/pdf-to-image/PdfToImageResult.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightIcon, DownloadIcon, RotateCcwIcon } from "lucide-react";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import type { ConvertedImage } from "@/lib/pdf/pdfToImage";
import type { PdfToImageLabels } from "./labels";

interface ResultCellProps {
  url: string | undefined;
  name: string;
  size: number;
  index: number;
  onDownload: () => void;
  downloadAria: string;
}

function ResultCell({
  url,
  name,
  size,
  index,
  onDownload,
  downloadAria,
}: ResultCellProps) {
  return (
    <div
      className="group relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-[5px]"
      style={{ background: "var(--silver-100)", border: "1px solid var(--silver-200)" }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="max-h-full max-w-full object-contain"
        />
      ) : null}

      <span
        className="pointer-events-none absolute left-1.5 top-1.5 rounded-md px-[7px] py-px text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: "rgba(20,30,60,0.85)" }}
      >
        {index}
      </span>

      <button
        type="button"
        onClick={onDownload}
        aria-label={downloadAria}
        title={downloadAria}
        className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md border bg-white/95 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
        style={{ borderColor: "var(--silver-200)", color: "var(--silver-700)" }}
      >
        <DownloadIcon className="size-3.5" />
      </button>

      <div
        className="pointer-events-none absolute inset-x-2 bottom-1.5 truncate rounded-md border bg-white/95 px-1 py-0.5 text-center text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
        style={{ borderColor: "var(--silver-200)", color: "var(--silver-700)" }}
      >
        {name} · {formatBytes(size)}
      </div>
    </div>
  );
}

interface PdfToImageResultProps {
  images: ConvertedImage[];
  labels: PdfToImageLabels;
  onDownloadAll: () => void;
  onDownloadOne: (image: ConvertedImage) => void;
  onCompress: () => void;
  onAgain: () => void;
}

export function PdfToImageResult({
  images,
  labels,
  onDownloadAll,
  onDownloadOne,
  onCompress,
  onAgain,
}: PdfToImageResultProps) {
  // Create object URLs for the result blobs, keyed on the images array, and
  // revoke them on cleanup. StrictMode double-mount re-creates fresh URLs and
  // revokes only its own batch, so no URL ever dies under a live <img>.
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = images.map((img) => URL.createObjectURL(img.blob));
    setUrls(next);
    return () => {
      for (const u of next) URL.revokeObjectURL(u);
    };
  }, [images]);

  const totalSize = useMemo(
    () => images.reduce((sum, img) => sum + img.blob.size, 0),
    [images],
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2" style={{ height: "52vh" }}>
      <div className="ob-scroll min-h-0 overflow-y-auto pr-1">
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, i) => (
            <ResultCell
              key={img.name}
              url={urls[i]}
              name={img.name}
              size={img.blob.size}
              index={i + 1}
              onDownload={() => onDownloadOne(img)}
              downloadAria={template(labels.downloadOneAria, { name: img.name })}
            />
          ))}
        </div>
      </div>

      <div
        className="flex flex-col gap-2 self-start rounded-[8px] border p-4"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "inset 2px 0 0 var(--accent-electric)",
        }}
      >
        <div className="font-display text-[13px] font-semibold" style={{ color: "var(--headline)" }}>
          {labels.resultTitle}
        </div>
        <div className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
          {template(labels.imageCountTemplate, { n: images.length })} · {formatBytes(totalSize)}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onDownloadAll}
            className="btn-download glint inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-4 font-display text-[12px] font-medium"
          >
            <DownloadIcon className="size-3.5" />
            {labels.download}
          </button>
          <button
            type="button"
            onClick={onCompress}
            className="handoff-action inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] border px-3 font-display text-[12px]"
          >
            {labels.compressHandoff}
            <ArrowRightIcon className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onAgain}
            className="nameplate inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-3 font-display text-[12px]"
            style={{ color: "var(--ink-strong)" }}
          >
            <RotateCcwIcon className="size-3.5" />
            {labels.again}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: No new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/pdf-to-image/PdfToImageResult.tsx
git commit -m "feat(pdf-to-image): 3-column result grid with hover overlays + action card"
```

---

## Task 9: PdfToImage orchestrator component

**Files:**
- Create: `src/components/tools/pdf-to-image/PdfToImage.tsx`

Multi-PDF ingest, PageItemCard grid (no dnd), format/DPI state, run, result switch, inline/standalone shell. Mirrors ImageToPdf minus dnd/page-size.

- [ ] **Step 1: Create the component**

Create `src/components/tools/pdf-to-image/PdfToImage.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileImage, PlusIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { PageItemCard, type SectionTint } from "@/components/pdf-editor/PageItemCard";
import { buildPageItems, deriveBaseName } from "@/components/pdf-editor/buildPageItems";
import { clearThumbnailCache } from "@/components/pdf-editor/thumbnailCache";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { stageFiles } from "@/lib/common/toolHandoff";
import { FILE_SIZE_LIMIT } from "@/lib/constants";
import { getErrorMessage } from "@/lib/errors";
import { buildConversionJobs } from "@/lib/pdf/buildConversionJobs";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { deriveZipName } from "@/lib/pdf/pdfToImageNaming";
import {
  pdfToImages,
  type ConvertedImage,
  type DpiOption,
  type OutputFormat,
} from "@/lib/pdf/pdfToImage";
import { type PageItem, type Rotation } from "@/lib/pdf/pageItem";
import { PdfToImageControls } from "./PdfToImageControls";
import { PdfToImageResult } from "./PdfToImageResult";
import { PdfToImageTopStrip } from "./PdfToImageTopStrip";
import type { PdfToImageLabels } from "./labels";

const PDF_ACCEPT = { "application/pdf": [".pdf"] };
const ACCEPT_ATTR = "application/pdf";
const NEUTRAL_TINT: SectionTint = { ring: "transparent" };

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

interface PdfToImageProps {
  labels: PdfToImageLabels;
  /** Locale for cross-tool handoff navigation. */
  lang: string;
  inline?: boolean;
}

export function PdfToImage({ labels, lang, inline = false }: PdfToImageProps) {
  const router = useRouter();

  const [items, setItems] = useState<PageItem[]>([]);
  const [sourceBytesById, setSourceBytesById] = useState<Map<string, Uint8Array>>(
    new Map(),
  );
  const [loadingPages, setLoadingPages] = useState(false);
  const [format, setFormat] = useState<OutputFormat>("image/jpeg");
  const [dpi, setDpi] = useState<DpiOption>(150);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingModeRef = useRef<"replace" | "append">("append");

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
  } = useToolProcessor<ConvertedImage[]>({
    processor: async (_files, onProgress) => {
      const jobs = buildConversionJobs(items);
      if (jobs.length === 0) throw new Error("변환할 페이지가 없습니다.");
      const baseName = deriveBaseName(items[0]?.sourceFileName);
      return pdfToImages({ jobs, sourceBytesById, format, dpi, baseName, onProgress });
    },
    onDownload: async (images) => {
      if (images.length === 0) return;
      const base = deriveBaseName(items[0]?.sourceFileName);
      if (images.length === 1) {
        const buf = await images[0].blob.arrayBuffer();
        downloadBlob(new Uint8Array(buf), images[0].name, format);
        return;
      }
      const zip = new JSZip();
      for (const img of images) zip.file(img.name, img.blob);
      const zipBytes = await zip.generateAsync({ type: "uint8array" });
      downloadBlob(zipBytes, deriveZipName(base), "application/zip");
    },
    errorOptions: {
      memoryHint:
        "브라우저 메모리가 부족합니다. DPI를 낮추거나 페이지가 적은 PDF를 사용해 주세요.",
    },
  });

  useEffect(() => () => clearThumbnailCache(), []);

  const ingest = useCallback(
    async (incoming: File[], mode: "replace" | "append") => {
      const pdfs = incoming.filter(isPdf);
      for (const f of incoming) {
        if (!isPdf(f)) toast.error(`${f.name}: PDF 파일만 추가할 수 있습니다.`);
      }
      const accepted = pdfs.filter((f) => f.size <= FILE_SIZE_LIMIT.guest);
      for (const f of pdfs) {
        if (f.size > FILE_SIZE_LIMIT.guest) {
          toast.error(
            `${f.name}: 파일 크기가 ${formatBytes(FILE_SIZE_LIMIT.guest)}를 초과합니다.`,
          );
        }
      }
      if (accepted.length === 0) return;

      setLoadingPages(true);
      try {
        const built = await buildPageItems(accepted);
        for (const n of built.failed) toast.error(`${n}: 열 수 없는 PDF입니다.`);
        if (built.items.length === 0) return;
        if (mode === "replace") {
          clearThumbnailCache();
          setItems(built.items);
          setSourceBytesById(built.sourceBytesById);
          setFiles(accepted);
        } else {
          setItems((prev) => [...prev, ...built.items]);
          setSourceBytesById((prev) => new Map([...prev, ...built.sourceBytesById]));
          setFiles([...files, ...accepted]);
        }
      } catch (err) {
        toast.error(
          getErrorMessage(err, { fallbackMessage: "파일을 읽을 수 없습니다." }).message,
        );
      } finally {
        setLoadingPages(false);
      }
    },
    [files, setFiles],
  );

  const handleUpload = useCallback(
    (newFiles: File[]) => {
      retry();
      void ingest(newFiles, "replace");
    },
    [retry, ingest],
  );

  const handleReset = useCallback(() => {
    retry();
    clearThumbnailCache();
    setItems([]);
    setSourceBytesById(new Map());
    setFiles([]);
  }, [retry, setFiles]);

  const handleReuploadPick = useCallback(() => {
    pendingModeRef.current = "replace";
    retry();
    fileInputRef.current?.click();
  }, [retry]);

  const handleAddClick = useCallback(() => {
    pendingModeRef.current = "append";
    fileInputRef.current?.click();
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files ? Array.from(e.target.files) : [];
      if (picked.length > 0) void ingest(picked, pendingModeRef.current);
      e.target.value = "";
    },
    [ingest],
  );

  const handleRotate = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, rotation: (((p.rotation + 90) % 360) as Rotation) } : p,
      ),
    );
  }, []);

  const handleDelete = useCallback((id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleDownloadOne = useCallback(
    async (image: ConvertedImage) => {
      const buf = await image.blob.arrayBuffer();
      downloadBlob(new Uint8Array(buf), image.name, format);
    },
    [format],
  );

  const handleCompress = useCallback(() => {
    if (!result) return;
    const imageFiles = result.map(
      (img) => new File([img.blob], img.name, { type: format }),
    );
    stageFiles(imageFiles, "pdf-to-image");
    router.push(`/${lang}/tools/image-compress`);
  }, [result, format, router, lang]);

  const hasFiles = items.length > 0;
  const busy = status === "processing";
  const liveCount = items.filter((p) => !p.deleted).length;

  const filesSummary =
    files.length <= 1
      ? template(labels.filesOneTemplate, { name: files[0]?.name ?? "" })
      : template(labels.filesManyTemplate, {
          name: files[0].name,
          rest: files.length - 1,
        });

  const editor = (
    <div className="flex flex-col gap-3" style={{ height: "52vh" }}>
      <PdfToImageTopStrip
        filesSummary={filesSummary}
        onReupload={handleReuploadPick}
        reuploadLabel={labels.reupload}
        onConvert={run}
        convertLabel={template(labels.convertTemplate, { n: liveCount })}
        convertDisabled={liveCount === 0}
        busy={busy}
      />

      <PdfToImageControls
        format={format}
        dpi={dpi}
        onFormatChange={setFormat}
        onDpiChange={setDpi}
        labels={labels}
      />

      <div
        className="ob-scroll min-h-0 flex-1 overflow-y-auto rounded-2xl p-3"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-md), inset 0 1px 0 rgba(255,255,255,0.8)",
        }}
      >
        <div className="flex flex-wrap justify-center gap-0">
          {items.map((item, i) => (
            <div key={item.id} className="flex items-stretch">
              <PageItemCard
                item={item}
                pageNumber={i + 1}
                bytes={sourceBytesById.get(item.sourceFileId)}
                tint={NEUTRAL_TINT}
                onRotate={handleRotate}
                onDelete={handleDelete}
                rotateAria={labels.rotateAria}
                deleteAria={labels.deleteAria}
                draggable={false}
              />
              <div className="w-[18px] shrink-0" aria-hidden="true" />
            </div>
          ))}
          <div className="flex items-stretch">
            <button
              type="button"
              onClick={handleAddClick}
              aria-label={labels.addAria}
              title={labels.addAria}
              className="my-[9px] flex h-[204px] w-[150px] items-center justify-center rounded-[5px] border-[1.5px] border-dashed text-[color:var(--ink-soft)] transition-colors hover:border-[color:var(--accent-electric)] hover:text-[color:var(--accent-electric)]"
              style={{
                borderColor: "var(--hairline)",
                background: "var(--bg-soft, var(--silver-100))",
              }}
            >
              <PlusIcon className="size-7" />
            </button>
            <div className="w-[18px] shrink-0" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );

  const body = (
    <div className={inline ? "space-y-4" : "space-y-4 px-6 py-3"}>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        onChange={handleFileInput}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {!hasFiles ? (
        <FileUpload
          accept={PDF_ACCEPT}
          multiple
          hideFileList
          onFiles={handleUpload}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={{ maxSize: labels.uploadMaxSize }}
        />
      ) : status === "idle" ? (
        editor
      ) : status === "done" && result ? (
        <PdfToImageResult
          images={result}
          labels={labels}
          onDownloadAll={download}
          onDownloadOne={handleDownloadOne}
          onCompress={handleCompress}
          onAgain={retry}
        />
      ) : (
        <div style={{ height: "52vh" }}>
          <ProcessingStatus
            status={status}
            progress={progress}
            errorMessage={errorMessage}
            onRetry={retry}
            onDownload={download}
            labels={{ processing: labels.processing }}
          />
        </div>
      )}

      {loadingPages && (
        <div className="flex items-center gap-2 text-sm text-[color:var(--ink)]">
          <span className="inline-block size-4 animate-spin rounded-full border-2 border-[color:var(--accent-electric)] border-t-transparent" />
          {labels.processing}
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
        onClick={handleReset}
        disabled={busy}
        aria-label={labels.reupload}
        title={labels.reupload}
        className="absolute right-6 top-4 z-10 rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        style={{ color: "var(--ink-soft)" }}
      >
        <RotateCcwIcon className="size-4" />
      </button>
      <div
        className="flex items-start gap-3 border-b px-6 pb-3 pt-3"
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
          <FileImage size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="font-display font-ko text-[16px] font-semibold leading-[1.2] tracking-[0.005em]"
            style={{ color: "var(--headline)" }}
          >
            {labels.title}
          </div>
          <div
            className="mt-1 font-body text-[12px] leading-[1.45]"
            style={{ color: "var(--ink)" }}
          >
            {labels.description}
          </div>
        </div>
      </div>
      {body}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: Errors remain ONLY in the old `pdf-to-image/page.tsx` (fixed next). Verify `SectionTint` is exported from `PageItemCard.tsx` — it is (`export interface SectionTint`).

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/pdf-to-image/PdfToImage.tsx
git commit -m "feat(pdf-to-image): tool orchestrator (multi-PDF grid, format/DPI, result, handoff)"
```

---

## Task 10: Rewrite the route page + wire the Screen3 inline mount

**Files:**
- Rewrite: `src/app/[lang]/(chrome)/tools/pdf-to-image/page.tsx`
- Modify: `src/components/landing/Screen3Workspace.tsx`

- [ ] **Step 1: Rewrite the route page**

Replace `src/app/[lang]/(chrome)/tools/pdf-to-image/page.tsx` entirely with:

```tsx
import { getDictionary, type Locale } from "@/i18n/config";
import { locales } from "@/i18n/locales";
import { PdfToImage } from "@/components/tools/pdf-to-image/PdfToImage";
import { getPdfToImageLabels } from "@/components/tools/pdf-to-image/labels";

interface PageProps {
  params: Promise<{ lang: string }>;
}

function asLocale(lang: string): Locale {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : "ko";
}

export default async function PdfToImagePage({ params }: PageProps) {
  const { lang } = await params;
  const dict = await getDictionary(asLocale(lang));
  const labels = getPdfToImageLabels(dict);

  return (
    <div
      className="mx-auto px-4 py-8"
      style={{
        width: "min(var(--tweak-workspace-width, 980px), calc(100vw - 32px))",
      }}
    >
      <PdfToImage labels={labels} lang={lang} />
    </div>
  );
}
```

- [ ] **Step 2: Add the Screen3 imports**

In `src/components/landing/Screen3Workspace.tsx`, after the existing image-to-pdf imports (around line 20-21):

```tsx
import { ImageToPdf } from "@/components/tools/image-to-pdf/ImageToPdf";
import { getImageToPdfLabels } from "@/components/tools/image-to-pdf/labels";
```

add:

```tsx
import { PdfToImage } from "@/components/tools/pdf-to-image/PdfToImage";
import { getPdfToImageLabels } from "@/components/tools/pdf-to-image/labels";
```

- [ ] **Step 3: Add the switch case**

In `renderToolBody()`, after the `case "image-to-pdf":` block (the `return <ImageToPdf .../>` line), add:

```tsx
      case "pdf-to-image":
        return <PdfToImage inline labels={getPdfToImageLabels(dict)} lang={locale} />;
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS — zero errors across the project (the old page.tsx call shape is gone).

- [ ] **Step 5: Commit**

```bash
git add "src/app/[lang]/(chrome)/tools/pdf-to-image/page.tsx" src/components/landing/Screen3Workspace.tsx
git commit -m "feat(pdf-to-image): silver route + Screen3 inline mount (replaces bridge)"
```

---

## Task 11: Full static verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `pnpm test`
Expected: PASS — including the new `pdfToImageNaming` (5) and `buildConversionJobs` (4) tests, and all pre-existing tests.

- [ ] **Step 2: Typecheck the whole project**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (0 errors).

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: PASS — `/[lang]/tools/pdf-to-image` builds; no type/lint failures.

- [ ] **Step 4: Lint (Biome)**

Run: `pnpm exec biome check src/components/tools/pdf-to-image src/lib/pdf/pdfToImage.ts src/lib/pdf/pdfToImageNaming.ts src/lib/pdf/buildConversionJobs.ts`
Expected: PASS (or auto-fixable formatting only — apply with `--write` if needed, then re-commit).

- [ ] **Step 5: Commit any lint fixes (if produced)**

```bash
git add -p
git commit -m "chore(pdf-to-image): biome formatting"
```

(Skip if Step 4 produced no changes.)

---

## Manual / browser verification (user-driven)

The agent cannot run the browser (gstack `browse.exe` blocked). The user verifies via `pnpm dev`:

- [ ] Silver visuals across upload → editor → processing → result.
- [ ] Multi-PDF: upload several PDFs (drag multiple + the "+" tile); all pages appear in one grid.
- [ ] Rotate + delete in the editor are reflected in the converted images.
- [ ] JPG vs PNG and 72/150/300 DPI produce correct outputs; 300-DPI hint shows.
- [ ] Result grid is 3 columns; hover shows number badge, filename + size, per-image download.
- [ ] Download all → ZIP (`{base}-images.zip`); single-page PDF → single image; per-image download works.
- [ ] image-compress handoff carries the converted images over.
- [ ] Tool height is fixed (~52vh) and does not change idle → processing → result.
- [ ] Dark mode: on-paper overlays (badge/chips) stay legible.
- [ ] StrictMode (dev): result thumbnails survive (no broken images after double-mount).
- [ ] Screen3 desk: opening the pdf-to-image card mounts inline (no bridge link).

---

## Self-review notes (spec coverage)

- Multi-PDF upload → Task 9 ingest (`multiple`, append via "+"), `buildPageItems`. ✓
- Input grid rotate/delete, no divider/reorder → Task 9 (`PageItemCard draggable={false}`, no DndContext). ✓
- Format/DPI silver toggles → Task 7. ✓
- Conversion honors rotation + deletion → Tasks 3, 4 (`buildConversionJobs` + `page.rotate + rotation`). ✓
- Result: 3-col grid + hover (number, filename, per-image download) → Task 8. ✓
- Result card: ZIP download, image-compress handoff, again → Tasks 8, 9. ✓
- Filenames `{base}-NN.ext` / `{base}-images.zip` → Task 2. ✓
- Fixed 52vh envelope across states → Task 9 (editor + processing wrapper) + Task 8 (result). ✓
- trap (i) ArrayBuffer detach → Task 4 (`bytes.slice()`). ✓
- trap (j) on-paper fixed color → Tasks 8 (badge `rgba(20,30,60,0.85)`, white chips). ✓
- StrictMode-safe object URLs → Task 8 (`useEffect` keyed on images + revoke). ✓
- i18n ko/en + inline mount → Tasks 5, 10. ✓
- TDD pure logic → Tasks 2, 3. ✓
- Only shared-component change is the backwards-compatible `draggable` prop → Task 1. ✓
