# pdf-to-image Batch Streaming Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream `pdf-to-image` output in size-bounded batches (one zip per batch) so peak memory is bounded by a single batch instead of the whole job, removing the output-accumulation OOM ceiling for large page counts.

**Architecture:** The render loop measures actual output bytes as it goes and flushes a batch when a byte target is reached *and pages remain*. A job that fits in one batch returns `preview` (today's grid behaviour, unchanged); a job that overflows mid-render returns `streamed` and the component zips+downloads each batch as it arrives. The flush decision is a pure function (`shouldFlush`) tested via a pure simulator (`planBatches`) so the batch-boundary logic is covered without canvas/pdfjs.

**Tech Stack:** TypeScript (strict), Next.js (App Router), pdfjs-dist, JSZip, sonner, vitest (node env).

---

### Task 1: Pure batch-boundary logic

**Files:**
- Create: `src/lib/pdf/batchPlan.ts`
- Test: `src/lib/pdf/batchPlan.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/pdf/batchPlan.test.ts
import { describe, expect, it } from "vitest";
import { planBatches, shouldFlush } from "./batchPlan";

describe("shouldFlush", () => {
  it("does not flush below target", () => {
    expect(shouldFlush(50, 100, 3)).toBe(false);
  });
  it("flushes at/over target when pages remain", () => {
    expect(shouldFlush(100, 100, 1)).toBe(true);
    expect(shouldFlush(120, 100, 5)).toBe(true);
  });
  it("never flushes when no pages remain (last page)", () => {
    expect(shouldFlush(100, 100, 0)).toBe(false);
    expect(shouldFlush(999, 100, 0)).toBe(false);
  });
});

describe("planBatches", () => {
  it("keeps everything in one batch when total stays under target", () => {
    expect(planBatches([10, 10, 10], 100)).toEqual([[0, 1, 2]]);
  });
  it("splits when the running total crosses target mid-job", () => {
    expect(planBatches([60, 60, 60], 100)).toEqual([[0, 1], [2]]);
  });
  it("stays a single batch when target is hit exactly on the last page", () => {
    expect(planBatches([50, 50], 100)).toEqual([[0, 1]]);
  });
  it("splits when target is hit exactly but pages remain", () => {
    expect(planBatches([50, 50, 50], 100)).toEqual([[0, 1], [2]]);
  });
  it("handles a single oversized page as one batch", () => {
    expect(planBatches([500], 100)).toEqual([[0]]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/pdf/batchPlan.test.ts`
Expected: FAIL — `Cannot find module './batchPlan'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/pdf/batchPlan.ts
// Pure batch-boundary logic for pdf-to-image streaming. No DOM/pdfjs — this is
// the testable model the render loop mirrors via shouldFlush(), so the loop and
// these tests can never disagree about where batch boundaries fall.

/**
 * Flush the current batch when its accumulated output bytes reach the target
 * AND there are still pages left to render. The "pages remain" guard means the
 * final partial batch is never split off prematurely: a job whose total only
 * reaches the target on its last page stays a single batch (= preview mode).
 */
export function shouldFlush(
  currentBytes: number,
  batchByteTarget: number,
  pagesRemaining: number,
): boolean {
  return currentBytes >= batchByteTarget && pagesRemaining > 0;
}

/**
 * Pure simulation of the render loop's batching over a known list of per-page
 * output byte sizes. Returns the page indices grouped per batch. A result with
 * one batch means "preview" (single zip / grid); more than one means "streamed".
 */
export function planBatches(pageBytes: number[], batchByteTarget: number): number[][] {
  const batches: number[][] = [];
  let current: number[] = [];
  let currentBytes = 0;

  for (let i = 0; i < pageBytes.length; i++) {
    current.push(i);
    currentBytes += pageBytes[i];
    const pagesRemaining = pageBytes.length - 1 - i;
    if (shouldFlush(currentBytes, batchByteTarget, pagesRemaining)) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/pdf/batchPlan.test.ts`
Expected: PASS (8 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/batchPlan.ts src/lib/pdf/batchPlan.test.ts
git commit -m "feat: pure batch-boundary logic for pdf-to-image streaming"
```

---

### Task 2: Batch zip naming helper

**Files:**
- Modify: `src/lib/pdf/pdfToImageNaming.ts`
- Test: `src/lib/pdf/pdfToImageNaming.test.ts`

- [ ] **Step 1: Write the failing test** (append to the existing test file)

```ts
// add to src/lib/pdf/pdfToImageNaming.test.ts
import { deriveBatchZipName } from "./pdfToImageNaming";

describe("deriveBatchZipName", () => {
  it("numbers each batch zip after the source base", () => {
    expect(deriveBatchZipName("bulletin", 1)).toBe("bulletin-images-1.zip");
    expect(deriveBatchZipName("bulletin", 12)).toBe("bulletin-images-12.zip");
  });
});
```

(If `describe`/`it`/`expect` are not yet imported at the top of the file, add `import { describe, expect, it } from "vitest";`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/pdf/pdfToImageNaming.test.ts`
Expected: FAIL — `deriveBatchZipName is not a function` / no export.

- [ ] **Step 3: Add the helper** (append below `deriveZipName` in `pdfToImageNaming.ts`)

```ts
/** Zip name for batch N when output is streamed in multiple archives. */
export function deriveBatchZipName(base: string, index: number): string {
  return `${base}-images-${index}.zip`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/pdf/pdfToImageNaming.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/pdfToImageNaming.ts src/lib/pdf/pdfToImageNaming.test.ts
git commit -m "feat: deriveBatchZipName for streamed pdf-to-image output"
```

---

### Task 3: Batch byte-target constant

**Files:**
- Modify: `src/lib/constants.ts:51` (just after `TOTAL_SIZE_WARN`)

- [ ] **Step 1: Add the constant**

Insert after the `TOTAL_SIZE_WARN` declaration:

```ts
/**
 * Target accumulated output bytes per batch for pdf-to-image streaming. When a
 * conversion's running output reaches this (with pages still remaining), the
 * current batch is zipped and downloaded, then memory is released before the
 * next batch. Bounds peak memory to ~one batch instead of the whole job.
 */
export const PDF_TO_IMAGE_BATCH_BYTES = 50 * MB;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS (no usages yet; constant compiles).

- [ ] **Step 3: Commit**

```bash
git add src/lib/constants.ts
git commit -m "feat: PDF_TO_IMAGE_BATCH_BYTES streaming target"
```

---

### Task 4: i18n labels for streamed result + per-batch toast

**Files:**
- Modify: `src/i18n/dictionaries/ko.json` (under `tools.pdf-to-image.page`)
- Modify: `src/i18n/dictionaries/en.json` (under `tools.pdf-to-image.page`)
- Modify: `src/components/tools/pdf-to-image/labels.ts`

- [ ] **Step 1: Add KO keys** — inside `tools["pdf-to-image"].page`, after `"again": "다시 하기"` (add a comma to that line):

```json
    "again": "다시 하기",
    "streamedTitle": "저장 완료",
    "streamedSummary": "이미지 {n}장을 zip 파일 {m}개로 나눠 저장했습니다.",
    "batchSavedToast": "파트 {n} 저장됨"
```

- [ ] **Step 2: Add EN keys** — inside `tools["pdf-to-image"].page`, after `"again": "Start over"` (add a comma to that line):

```json
    "again": "Start over",
    "streamedTitle": "Saved",
    "streamedSummary": "Saved {n} images across {m} zip files.",
    "batchSavedToast": "Part {n} saved"
```

- [ ] **Step 3: Extend the labels type and getter** in `labels.ts`

Add to the `PdfToImageLabels` interface, after `again: string;`:

```ts
  streamedTitle: string;
  streamedSummary: string;
  batchSavedToast: string;
```

Add to the returned object in `getPdfToImageLabels`, after `again: p.again,`:

```ts
    streamedTitle: p.streamedTitle,
    streamedSummary: p.streamedSummary,
    batchSavedToast: p.batchSavedToast,
```

- [ ] **Step 4: Typecheck** (the `Dictionary` type is derived from `ko.json`, so the new keys must exist there for `p.streamedTitle` to type-check)

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/dictionaries/ko.json src/i18n/dictionaries/en.json src/components/tools/pdf-to-image/labels.ts
git commit -m "feat: i18n for pdf-to-image streamed result + batch toast"
```

---

### Task 5: Streamed-result summary component

**Files:**
- Create: `src/components/tools/pdf-to-image/PdfToImageStreamedResult.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/tools/pdf-to-image/PdfToImageStreamedResult.tsx
"use client";

import { RotateCcwIcon } from "lucide-react";
import { template } from "@/lib/common/template";
import type { PdfToImageLabels } from "./labels";

interface PdfToImageStreamedResultProps {
  imageCount: number;
  batchCount: number;
  labels: PdfToImageLabels;
  onAgain: () => void;
}

export function PdfToImageStreamedResult({
  imageCount,
  batchCount,
  labels,
  onAgain,
}: PdfToImageStreamedResultProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-[8px] border"
      style={{
        height: "52vh",
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      <div
        className="font-ko text-[15px] font-medium"
        style={{ color: "var(--headline)" }}
      >
        {labels.streamedTitle}
      </div>
      <div className="font-body text-[12.5px]" style={{ color: "var(--ink-soft)" }}>
        {template(labels.streamedSummary, { n: imageCount, m: batchCount })}
      </div>
      <button
        type="button"
        onClick={onAgain}
        className="nameplate inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-3 font-body text-[12px]"
        style={{ color: "var(--ink-strong)" }}
      >
        <RotateCcwIcon className="size-3.5" />
        {labels.again}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS (component is self-contained; not yet imported).

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/pdf-to-image/PdfToImageStreamedResult.tsx
git commit -m "feat: streamed-result summary panel for pdf-to-image"
```

---

### Task 6: Render-lib streaming + component wiring

This task flips `pdfToImages`' return type and updates its sole consumer in the
same commit, so the build stays green.

**Files:**
- Modify: `src/lib/pdf/pdfToImage.ts`
- Modify: `src/components/tools/pdf-to-image/PdfToImage.tsx`

- [ ] **Step 1: Update the render library** (`pdfToImage.ts`)

Add an import at the top (after the existing local imports):

```ts
import { shouldFlush } from "./batchPlan";
```

Replace the `ConvertedImage` interface and `PdfToImageOptions` interface with:

```ts
export interface ConvertedImage {
  name: string;
  blob: Blob;
}

export type PdfToImageOutcome =
  | { mode: "preview"; images: ConvertedImage[] }
  | { mode: "streamed"; imageCount: number; batchCount: number };

export interface PdfToImageOptions {
  jobs: ConversionJob[];
  /** Raw source bytes per file id (shared with the thumbnail cache). */
  sourceBytesById: Map<string, Uint8Array>;
  format: OutputFormat;
  dpi: DpiOption;
  /** Flush a batch once accumulated output reaches this many bytes. */
  batchByteTarget: number;
  /** Called with each filled batch when streaming (more than one batch). */
  onBatch?: (
    images: ConvertedImage[],
    batchIndex: number,
    isLast: boolean,
  ) => Promise<void> | void;
  onProgress?: (pct: number) => void;
}
```

Change the function signature return type and destructure the new options:

```ts
export async function pdfToImages({
  jobs,
  sourceBytesById,
  format,
  dpi,
  batchByteTarget,
  onBatch,
  onProgress,
}: PdfToImageOptions): Promise<PdfToImageOutcome> {
```

Replace the rendering body (from `const images: ConvertedImage[] = [];` through the final `return images;`) with the batching loop. The per-page render block (viewport, canvas, toBlob, canvas release, per-page catch) is **unchanged** — only the accumulation/flush and return change:

```ts
  // `current` holds only the in-flight batch (released after each flush), so peak
  // memory is bounded by batchByteTarget rather than the whole job's output.
  const current: ConvertedImage[] = [];
  let currentBytes = 0;
  let streaming = false;
  let batchIndex = 0;
  let totalProduced = 0;

  const flush = async (isLast: boolean) => {
    batchIndex++;
    await onBatch?.(current.slice(), batchIndex, isLast);
    current.length = 0;
    currentBytes = 0;
  };

  try {
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      try {
        const doc = await getDoc(job.sourceFileId);
        const page = await doc.getPage(job.sourcePageIndex + 1);
        const rotation = (page.rotate + job.rotation) % 360;

        let viewport = page.getViewport({ scale, rotation });
        const over = Math.max(
          viewport.width / MAX_CANVAS_DIM,
          viewport.height / MAX_CANVAS_DIM,
          Math.sqrt((viewport.width * viewport.height) / MAX_CANVAS_AREA),
        );
        if (over > 1) {
          viewport = page.getViewport({ scale: scale / over, rotation });
        }

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

        current.push({ name: names[i], blob });
        currentBytes += blob.size;
        totalProduced++;

        // Release the canvas backing store immediately (OOM guard for big PDFs).
        canvas.width = 0;
        canvas.height = 0;
      } catch (err) {
        // Isolate per-page failures so one bad page never discards the whole
        // batch. The slot's name is skipped, leaving a numbering gap.
        console.warn(`pdf-to-image: page ${i + 1} 변환 실패`, err);
      } finally {
        onProgress?.(Math.round(((i + 1) / total) * 100));
      }

      // Mirror planBatches(): flush once the running output reaches the target
      // and pages still remain (so the final partial batch is never split early).
      const pagesRemaining = jobs.length - 1 - i;
      if (shouldFlush(currentBytes, batchByteTarget, pagesRemaining)) {
        streaming = true;
        await flush(false);
      }
    }
  } finally {
    for (const doc of docCache.values()) doc.destroy();
  }

  if (totalProduced === 0) {
    throw new Error("변환된 페이지가 없습니다.");
  }

  if (streaming) {
    if (current.length > 0) await flush(true);
    return { mode: "streamed", imageCount: totalProduced, batchCount: batchIndex };
  }

  return { mode: "preview", images: current };
```

- [ ] **Step 2: Update the component** (`PdfToImage.tsx`)

Update imports:
- Add `PdfToImageStreamedResult` import: `import { PdfToImageStreamedResult } from "./PdfToImageStreamedResult";` (next to the other `./` imports).
- Add `PdfToImageOutcome` to the `@/lib/pdf/pdfToImage` import and drop the now-unused `ConvertedImage` only if it is no longer referenced (it is still used by `handleDownloadOne`, so keep it):
  ```ts
  import {
    pdfToImages,
    type ConvertedImage,
    type DpiOption,
    type OutputFormat,
    type PdfToImageOutcome,
  } from "@/lib/pdf/pdfToImage";
  ```
- Add `deriveBatchZipName` to the naming import:
  ```ts
  import { deriveBatchZipName, deriveZipName } from "@/lib/pdf/pdfToImageNaming";
  ```
- Add `PDF_TO_IMAGE_BATCH_BYTES` to the constants import:
  ```ts
  import { PDF_TO_IMAGE_BATCH_BYTES, TOTAL_SIZE_WARN, uploadLimitFor } from "@/lib/constants";
  ```

Change the processor generic and body. Replace the `useToolProcessor<ConvertedImage[]>({ ... })` call's `processor` and `onDownload` with:

```ts
  } = useToolProcessor<PdfToImageOutcome>({
    processor: async (_files, onProgress) => {
      const jobs = buildConversionJobs(items);
      if (jobs.length === 0) throw new Error("변환할 페이지가 없습니다.");
      const base = deriveBaseName(items[0]?.sourceFileName);
      return pdfToImages({
        jobs,
        sourceBytesById,
        format,
        dpi,
        batchByteTarget: PDF_TO_IMAGE_BATCH_BYTES,
        onBatch: async (batchImages, batchIndex) => {
          const zip = new JSZip();
          for (const img of batchImages) zip.file(img.name, img.blob);
          const zipBlob = await zip.generateAsync({
            type: "blob",
            compression: "STORE",
          });
          downloadBlobObject(zipBlob, deriveBatchZipName(base, batchIndex));
          toast.success(template(labels.batchSavedToast, { n: batchIndex }));
          // Space sequential downloads so the browser does not block them.
          await new Promise((resolve) => setTimeout(resolve, 300));
        },
        onProgress,
      });
    },
    onDownload: async (outcome) => {
      if (outcome.mode !== "preview") return;
      const images = outcome.images;
      if (images.length === 0) return;
      if (images.length === 1) {
        downloadBlobObject(images[0].blob, images[0].name);
        return;
      }
      const base = deriveBaseName(items[0]?.sourceFileName);
      const zip = new JSZip();
      for (const img of images) zip.file(img.name, img.blob);
      // Images are already compressed — STORE skips a pointless deflate pass and
      // lets JSZip stream to a Blob instead of building one giant Uint8Array.
      const zipBlob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      downloadBlobObject(zipBlob, deriveZipName(base));
    },
    errorOptions: {
      memoryHint:
        "브라우저 메모리가 부족합니다. DPI를 낮추거나 페이지가 적은 PDF를 사용해 주세요.",
    },
  });
```

Guard `handleCompress` on preview mode:

```ts
  const handleCompress = useCallback(() => {
    if (!result || result.mode !== "preview") return;
    const imageFiles = result.images.map(
      (img) => new File([img.blob], img.name, { type: format }),
    );
    stageFiles(imageFiles, "pdf-to-image");
    router.push(`/${lang}/tools/image-compress`);
  }, [result, format, router, lang]);
```

Replace the done-state render branch (`status === "done" && result ? (...PdfToImageResult...)`) with a mode switch:

```tsx
      ) : status === "done" && result ? (
        result.mode === "preview" ? (
          <PdfToImageResult
            images={result.images}
            labels={labels}
            format={format}
            onDownloadAll={download}
            onDownloadOne={handleDownloadOne}
            onCompress={handleCompress}
            onAgain={retry}
          />
        ) : (
          <PdfToImageStreamedResult
            imageCount={result.imageCount}
            batchCount={result.batchCount}
            labels={labels}
            onAgain={retry}
          />
        )
      ) : (
```

(`handleDownloadOne` keeps its existing `ConvertedImage` signature — it is only called from the preview grid.)

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Lint the touched files**

Run: `pnpm eslint src/lib/pdf/pdfToImage.ts src/components/tools/pdf-to-image/PdfToImage.tsx`
Expected: 0 errors. (Fix any unused-import warning, e.g. drop `ConvertedImage` if eslint reports it unused — it should still be used by `handleDownloadOne`.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/pdfToImage.ts src/components/tools/pdf-to-image/PdfToImage.tsx
git commit -m "feat: stream pdf-to-image output as per-batch zips"
```

---

### Task 7: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm vitest run`
Expected: PASS, including `batchPlan.test.ts` and `pdfToImageNaming.test.ts`.

- [ ] **Step 2: Typecheck the whole project**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint the whole project**

Run: `pnpm lint`
Expected: 0 errors.

- [ ] **Step 4: Production build (catches Turbopack/route issues)**

Run: `pnpm build`
Expected: build completes; `/tools/pdf-to-image` and its locale routes compile.

- [ ] **Step 5: Manual smoke (user-run dev server)**

The user runs the dev server. Verify by hand:
- A small PDF (few pages) → result shows the **grid** (preview mode), single zip on "전체 다운로드".
- A large/many-page PDF at 300 DPI → multiple `*-images-N.zip` downloads with "파트 N 저장됨" toasts, then the **streamed summary** panel ("이미지 N장을 zip 파일 M개로 나눠 저장했습니다.") with "다시 하기".

---

## Self-Review

- **Spec coverage:**
  - "measure while flushing" loop + `batchByteTarget`/`onBatch` → Task 6 (lib).
  - `PdfToImageOutcome` discriminated union, preview = no regression → Task 6, edge covered by Task 1 tests.
  - Pure batch-decision tested in isolation → Task 1.
  - Component zip-per-batch, ~300 ms spacing, per-batch toast → Task 6.
  - Streamed summary panel, no grid/compress for streamed → Tasks 5 + 6.
  - `deriveBatchZipName`, global image numbering preserved → Task 2 (numbering unchanged: `assignImageNames` untouched).
  - `PDF_TO_IMAGE_BATCH_BYTES` constant → Task 3.
  - ④ cap recalibration → intentionally out of this plan (separate step after merge, per spec).
- **Placeholder scan:** none — every code step shows full code.
- **Type consistency:** `PdfToImageOutcome` (`mode: "preview" | "streamed"`), `shouldFlush(currentBytes, batchByteTarget, pagesRemaining)`, `deriveBatchZipName(base, index)`, labels `streamedTitle`/`streamedSummary`/`batchSavedToast` are used identically across Tasks 1–6.
