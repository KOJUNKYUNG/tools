# image-to-pdf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `image-to-pdf` to the silver design as a dedicated tool that reuses pdf-arrange's page editor, adds a page-size control (fit-to-image / A4 portrait / custom px) with aspect-preserving upscaling + white letterbox, previews the real output PDF, and hands the result off to pdf-compress.

**Architecture:** Extract the shared page-editor primitives into `components/pdf-editor/`. Add a pure `computeImageFit` geometry helper (TDD). Extend the shared `assembleSections` with an optional `imageLayout` (backward-compatible). Build a new `components/tools/image-to-pdf/` tool that composes these, mirroring `PdfArrange.tsx` minus split/divider.

**Tech Stack:** Next.js 16 App Router, TS strict, Tailwind v4, pdf-lib, pdfjs (self-hosted), @dnd-kit, Vitest (node-env), lucide-react. Windows + Git Bash, pnpm.

**Conventions:** Pure logic = TDD (vitest node-env). UI = browser-verified (no jsdom); the gstack `browse.exe` is blocked by Windows Application Control here, so the visual pass is done by the user on `localhost:3000`. Per task: `pnpm exec tsc --noEmit` + `pnpm test` + `pnpm build` green, then commit. Do NOT run `pnpm dev`. English commits, explicit `git add <paths>`, expect harmless LF→CRLF warnings.

---

## File Structure

**Created:**
- `src/components/pdf-editor/PageItemCard.tsx` (moved)
- `src/components/pdf-editor/useLazyThumbnail.ts` (moved)
- `src/components/pdf-editor/thumbnailCache.ts` (moved)
- `src/components/pdf-editor/buildPageItems.ts` (moved)
- `src/lib/pdf/imageFit.ts` + `src/lib/pdf/imageFit.test.ts`
- `src/components/tools/image-to-pdf/ImageToPdf.tsx`
- `src/components/tools/image-to-pdf/ImageToPdfTopStrip.tsx`
- `src/components/tools/image-to-pdf/PageSizeSelector.tsx`
- `src/components/tools/image-to-pdf/ImageToPdfResult.tsx`
- `src/components/tools/image-to-pdf/labels.ts`

**Modified:**
- `src/components/tools/pdf-arrange/PdfArrange.tsx` (import paths)
- `src/components/tools/pdf-arrange/PdfArrangeResult.tsx` (import path)
- `src/lib/pdf/assembleSections.ts` (`imageLayout` param)
- `src/components/landing/Screen3Workspace.tsx` (renderToolBody case)
- `src/app/[lang]/(chrome)/tools/image-to-pdf/page.tsx` (replace old body)
- `src/app/[lang]/(chrome)/tools/pdf-compress/page.tsx` (consume handoff)
- `src/i18n/dictionaries/ko.json`, `src/i18n/dictionaries/en.json` (`image-to-pdf.page`)

**Deleted:** none (the old `src/lib/pdf/imageToPdf.ts` becomes unused — leave it; removal is a separate hard-stop cleanup).

---

## Task 1: Extract shared page-editor module

Mechanical move of 4 files out of `pdf-arrange/` into a shared `pdf-editor/` module, then fix the importers. No behavior change.

**Files:**
- Move: `src/components/tools/pdf-arrange/{PageItemCard.tsx,useLazyThumbnail.ts,thumbnailCache.ts,buildPageItems.ts}` → `src/components/pdf-editor/`
- Modify: `src/components/tools/pdf-arrange/PdfArrange.tsx`, `src/components/tools/pdf-arrange/PdfArrangeResult.tsx`

- [ ] **Step 1: Move the 4 files**

```bash
mkdir -p src/components/pdf-editor
git mv src/components/tools/pdf-arrange/PageItemCard.tsx src/components/pdf-editor/PageItemCard.tsx
git mv src/components/tools/pdf-arrange/useLazyThumbnail.ts src/components/pdf-editor/useLazyThumbnail.ts
git mv src/components/tools/pdf-arrange/thumbnailCache.ts src/components/pdf-editor/thumbnailCache.ts
git mv src/components/tools/pdf-arrange/buildPageItems.ts src/components/pdf-editor/buildPageItems.ts
```

The moved files' internal imports are all either absolute (`@/lib/...`) or same-directory relative (`./thumbnailCache`, `./useLazyThumbnail`) and stay valid after the move — do NOT edit the moved files.

- [ ] **Step 2: Fix imports in `PdfArrange.tsx`**

In `src/components/tools/pdf-arrange/PdfArrange.tsx`, change the three local imports:

```tsx
import { buildPageItems, deriveBaseName } from "@/components/pdf-editor/buildPageItems";
import { PageItemCard, type SectionTint } from "@/components/pdf-editor/PageItemCard";
import { clearThumbnailCache } from "@/components/pdf-editor/thumbnailCache";
```

(These replace the former `./buildPageItems`, `./PageItemCard`, `./thumbnailCache` imports. Leave `./Divider`, `./EditorTopStrip`, `./PdfArrangeResult`, `./labels` as-is.)

- [ ] **Step 3: Fix import in `PdfArrangeResult.tsx`**

In `src/components/tools/pdf-arrange/PdfArrangeResult.tsx`, change:

```tsx
import { useLazyThumbnail } from "@/components/pdf-editor/useLazyThumbnail";
```

- [ ] **Step 4: Confirm no stale local imports remain**

Use Grep for `from "\./(PageItemCard|useLazyThumbnail|thumbnailCache|buildPageItems)"` under `src/components/tools/pdf-arrange/`. Expected: no matches.

- [ ] **Step 5: Verify build**

Run: `pnpm exec tsc --noEmit` then `pnpm test` then `pnpm build`
Expected: all green (78 tests still pass; pdf-arrange unchanged behaviorally).

- [ ] **Step 6: Commit**

```bash
git add src/components/pdf-editor src/components/tools/pdf-arrange/PdfArrange.tsx src/components/tools/pdf-arrange/PdfArrangeResult.tsx
git commit -m "refactor: extract shared page-editor primitives to components/pdf-editor"
```

---

## Task 2: `computeImageFit` geometry helper (TDD)

Pure function: how to place an image (preserving aspect, upscaling allowed, centered) on a fixed page, accounting for clockwise rotation. No pdf-lib.

**Files:**
- Create: `src/lib/pdf/imageFit.ts`
- Test: `src/lib/pdf/imageFit.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/pdf/imageFit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeImageFit } from "./imageFit";

const A4 = { w: 595, h: 842 };

describe("computeImageFit", () => {
  it("centers a landscape image in portrait A4 (no rotation), scaling to width", () => {
    const f = computeImageFit(1000, 500, A4.w, A4.h, 0);
    expect(f.drawW).toBeCloseTo(595, 3);
    expect(f.drawH).toBeCloseTo(297.5, 3);
    expect(f.x).toBeCloseTo(0, 3);
    expect(f.y).toBeCloseTo(272.25, 3);
    expect(f.rotateDeg).toBe(0);
  });

  it("centers a portrait image in portrait A4, scaling to height", () => {
    const f = computeImageFit(500, 1000, A4.w, A4.h, 0);
    expect(f.drawW).toBeCloseTo(421, 3);
    expect(f.drawH).toBeCloseTo(842, 3);
    expect(f.x).toBeCloseTo(87, 3);
    expect(f.y).toBeCloseTo(0, 3);
  });

  it("upscales a small image to fill the page (aspect preserved)", () => {
    const f = computeImageFit(100, 100, A4.w, A4.h, 0);
    expect(f.drawW).toBeCloseTo(595, 3);
    expect(f.drawH).toBeCloseTo(595, 3);
    expect(f.x).toBeCloseTo(0, 3);
    expect(f.y).toBeCloseTo(123.5, 3);
  });

  it("swaps effective dimensions for 90° rotation and emits ccw rotateDeg", () => {
    const f = computeImageFit(1000, 500, A4.w, A4.h, 90);
    // rotated bounding box (drawH × drawW) must fit the page
    expect(f.drawW).toBeCloseTo(842, 3);
    expect(f.drawH).toBeCloseTo(421, 3);
    expect(f.rotateDeg).toBe(270); // clockwise 90 → counterclockwise 270
  });

  it("maps clockwise rotation to counterclockwise pdf-lib degrees", () => {
    expect(computeImageFit(10, 10, 100, 100, 0).rotateDeg).toBe(0);
    expect(computeImageFit(10, 10, 100, 100, 90).rotateDeg).toBe(270);
    expect(computeImageFit(10, 10, 100, 100, 180).rotateDeg).toBe(180);
    expect(computeImageFit(10, 10, 100, 100, 270).rotateDeg).toBe(90);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm test -- imageFit`
Expected: FAIL (module not found / computeImageFit undefined).

- [ ] **Step 3: Implement**

Create `src/lib/pdf/imageFit.ts`:

```ts
// Pure geometry for placing an image on a fixed-size PDF page: preserve aspect
// ratio, upscale to fill, center, and account for clockwise page rotation.
// No pdf-lib here so the math is unit-testable in node-env.

import type { Rotation } from "./pageItem";

export interface ImageFit {
  /** Draw width in the image's own (pre-rotation) orientation, in points. */
  drawW: number;
  /** Draw height in the image's own orientation, in points. */
  drawH: number;
  /** Lower-left anchor X passed to pdf-lib drawImage. */
  x: number;
  /** Lower-left anchor Y passed to pdf-lib drawImage. */
  y: number;
  /** Counterclockwise degrees for pdf-lib drawImage `rotate` (it rotates ccw). */
  rotateDeg: number;
}

/**
 * Fit an `imgW`×`imgH` image into a `pageW`×`pageH` page (points), preserving
 * aspect ratio, upscaling allowed, centered. `rotation` is the user's clockwise
 * rotation; the returned anchor keeps the image centered after pdf-lib applies
 * `rotateDeg` (counterclockwise) about the lower-left anchor.
 */
export function computeImageFit(
  imgW: number,
  imgH: number,
  pageW: number,
  pageH: number,
  rotation: Rotation,
): ImageFit {
  const swapped = rotation === 90 || rotation === 270;
  const effW = swapped ? imgH : imgW;
  const effH = swapped ? imgW : imgH;

  const scale = Math.min(pageW / effW, pageH / effH); // upscaling allowed
  const drawW = imgW * scale;
  const drawH = imgH * scale;

  const rotateDeg = (360 - rotation) % 360; // clockwise → counterclockwise
  const theta = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  // Center of the image relative to its lower-left anchor, rotated by theta.
  const rx = (drawW / 2) * cos - (drawH / 2) * sin;
  const ry = (drawW / 2) * sin + (drawH / 2) * cos;

  return {
    drawW,
    drawH,
    x: pageW / 2 - rx,
    y: pageH / 2 - ry,
    rotateDeg,
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm test -- imageFit`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/imageFit.ts src/lib/pdf/imageFit.test.ts
git commit -m "feat: add computeImageFit geometry helper for fixed-page image placement"
```

---

## Task 3: Extend `assembleSections` with `imageLayout`

Add an optional, backward-compatible image layout. pdf-arrange passes nothing (default `native` = current behavior). image-to-pdf passes `fixed`.

**Files:**
- Modify: `src/lib/pdf/assembleSections.ts`
- Test: `src/lib/pdf/assembleSections.imageLayout.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/pdf/assembleSections.imageLayout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { assembleSections } from "./assembleSections";
import type { PageItem } from "./pageItem";

// Minimal 1x1 PNG (red pixel).
const PNG_1x1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

function imageItem(fileId: string): PageItem {
  return {
    id: "p1",
    sourceFileId: fileId,
    sourceFileName: "a.png",
    kind: "image",
    sourcePageIndex: 0,
    rotation: 0,
    splitAfter: false,
    deleted: false,
  };
}

describe("assembleSections imageLayout", () => {
  it("defaults to native: page size equals the image size", async () => {
    const id = "f1";
    const out = await assembleSections({
      sections: [[imageItem(id)]],
      sourceBytesById: new Map([[id, PNG_1x1]]),
    });
    const doc = await PDFDocument.load(out[0]);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(1, 1);
    expect(height).toBeCloseTo(1, 1);
  });

  it("fixed mode: page size equals the requested A4 size", async () => {
    const id = "f1";
    const out = await assembleSections({
      sections: [[imageItem(id)]],
      sourceBytesById: new Map([[id, PNG_1x1]]),
      imageLayout: { mode: "fixed", widthPt: 595, heightPt: 842 },
    });
    const doc = await PDFDocument.load(out[0]);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(595, 1);
    expect(height).toBeCloseTo(842, 1);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm test -- assembleSections.imageLayout`
Expected: FAIL (the second test: `imageLayout` not accepted / page is 1×1).

- [ ] **Step 3: Implement the extension**

In `src/lib/pdf/assembleSections.ts`:

3a. Add the import + type. At the top imports, add:

```ts
import { PDFDocument, degrees, rgb } from "pdf-lib";
import { type PageItem, buildOutputNames } from "./pageItem";
import { computeImageFit } from "./imageFit";
```

(Replace the existing `import { PDFDocument, degrees } from "pdf-lib";` line — add `rgb`.)

Add the layout type and extend `AssembleInput`:

```ts
export type ImageLayout =
  | { mode: "native" }
  | { mode: "fixed"; widthPt: number; heightPt: number };

export interface AssembleInput {
  sections: PageItem[][];
  sourceBytesById: Map<string, Uint8Array>;
  /** Image placement. Default: native (page = image size, current behavior). */
  imageLayout?: ImageLayout;
}
```

3b. Thread `imageLayout` into the function signature and the image branch. Change the function signature destructure:

```ts
export async function assembleSections(
  { sections, sourceBytesById, imageLayout = { mode: "native" } }: AssembleInput,
  onProgress?: (pct: number) => void,
): Promise<Uint8Array[]> {
```

Replace the entire image `else` branch (the `} else {` block that embeds the image) with:

```ts
      } else {
        const bytes = sourceBytesById.get(item.sourceFileId);
        if (!bytes) throw new Error(`원본 파일을 찾을 수 없습니다: ${item.sourceFileId}`);
        const image =
          detectImageFormat(bytes) === "png"
            ? await out.embedPng(bytes)
            : await out.embedJpg(bytes);
        const { width: imgW, height: imgH } = image.scale(1);

        if (imageLayout.mode === "native") {
          const page = out.addPage([imgW, imgH]);
          page.drawImage(image, { x: 0, y: 0, width: imgW, height: imgH });
          if (item.rotation !== 0) page.setRotation(degrees(item.rotation));
        } else {
          const { widthPt, heightPt } = imageLayout;
          const page = out.addPage([widthPt, heightPt]);
          page.drawRectangle({
            x: 0,
            y: 0,
            width: widthPt,
            height: heightPt,
            color: rgb(1, 1, 1),
          });
          const fit = computeImageFit(imgW, imgH, widthPt, heightPt, item.rotation);
          page.drawImage(image, {
            x: fit.x,
            y: fit.y,
            width: fit.drawW,
            height: fit.drawH,
            rotate: degrees(fit.rotateDeg),
          });
        }
      }
```

(The `pdf` branch above it is unchanged.)

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm test -- assembleSections`
Expected: PASS (new file + any existing assembleSections tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/assembleSections.ts src/lib/pdf/assembleSections.imageLayout.test.ts
git commit -m "feat: assembleSections supports fixed-page image layout (A4/custom)"
```

---

## Task 4: Labels + i18n

**Files:**
- Create: `src/components/tools/image-to-pdf/labels.ts`
- Modify: `src/i18n/dictionaries/ko.json`, `src/i18n/dictionaries/en.json`

- [ ] **Step 1: Add the `page` block to `ko.json`**

In `src/i18n/dictionaries/ko.json`, find `tools."image-to-pdf"` (it has `title` + `description`). Add a `page` sibling key:

```json
"image-to-pdf": {
  "title": "이미지 → PDF",
  "description": "이미지 여러 장을 하나의 PDF로 묶습니다.",
  "page": {
    "uploadPrompt": "이미지를 드래그하거나 클릭하여 업로드",
    "uploadHint": "JPG·PNG. 여러 장을 한 번에 올릴 수 있어요.",
    "uploadMaxSize": "파일당 최대 {size}",
    "reupload": "다시 업로드",
    "convert": "PDF로 변환 ({n}장)",
    "filesOne": "{name}",
    "filesMany": "{name} 외 {rest}장",
    "addAria": "이미지 추가",
    "rotateAria": "회전",
    "deleteAria": "삭제",
    "processing": "변환 중…",
    "sizeLabel": "페이지 크기",
    "sizeFit": "이미지맞춤",
    "sizeA4": "A4",
    "sizeCustom": "사용자 지정",
    "customWidth": "가로(px)",
    "customHeight": "세로(px)",
    "resultTitle": "PDF 준비 완료",
    "pageCount": "{n}페이지",
    "download": "다운로드",
    "compressHandoff": "PDF 압축하기",
    "again": "다시"
  }
}
```

(Keep the existing `title`/`description` values; only add `page`.)

- [ ] **Step 2: Add the identical-shape block to `en.json`**

In `src/i18n/dictionaries/en.json`, mirror the same `page` keys with English values:

```json
"image-to-pdf": {
  "title": "Image → PDF",
  "description": "Combine multiple images into a single PDF.",
  "page": {
    "uploadPrompt": "Drag images here or click to upload",
    "uploadHint": "JPG / PNG. Add several at once.",
    "uploadMaxSize": "Up to {size} per file",
    "reupload": "Re-upload",
    "convert": "Convert to PDF ({n})",
    "filesOne": "{name}",
    "filesMany": "{name} +{rest}",
    "addAria": "Add images",
    "rotateAria": "Rotate",
    "deleteAria": "Delete",
    "processing": "Converting…",
    "sizeLabel": "Page size",
    "sizeFit": "Fit image",
    "sizeA4": "A4",
    "sizeCustom": "Custom",
    "customWidth": "Width (px)",
    "customHeight": "Height (px)",
    "resultTitle": "PDF ready",
    "pageCount": "{n} pages",
    "download": "Download",
    "compressHandoff": "Compress PDF",
    "again": "Start over"
  }
}
```

(Keep existing `title`/`description`; match the `page` key set exactly to ko.json so the inferred `Dictionary` type stays consistent.)

- [ ] **Step 2.5: Confirm the JSON edits sit beside the existing keys**

Use Read on both files around `"image-to-pdf"` to confirm `title`, `description`, and the new `page` object are siblings and the JSON is valid (no trailing-comma errors).

- [ ] **Step 3: Create `labels.ts`**

Create `src/components/tools/image-to-pdf/labels.ts`:

```ts
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
  };
}
```

(`Dictionary` is exported from `@/i18n/config` — confirmed by `Screen3Workspace.tsx` and `pdf-arrange/page.tsx`. `dict.tools["image-to-pdf"].title/description` already exist in both dictionaries.)

- [ ] **Step 4: Verify build**

Run: `pnpm exec tsc --noEmit` then `pnpm build`
Expected: green (type inference over both dictionaries succeeds; identical shapes).

- [ ] **Step 5: Commit**

```bash
git add src/i18n/dictionaries/ko.json src/i18n/dictionaries/en.json src/components/tools/image-to-pdf/labels.ts
git commit -m "feat(image-to-pdf): i18n page block + labels mapper"
```

---

## Task 5: `PageSizeSelector` component

The page-size control: three blue-active toggles + custom px inputs.

**Files:**
- Create: `src/components/tools/image-to-pdf/PageSizeSelector.tsx`

- [ ] **Step 1: Define the page-size model + component**

Create `src/components/tools/image-to-pdf/PageSizeSelector.tsx`:

```tsx
"use client";

export type PageSizeMode = "fit" | "a4" | "custom";

export interface CustomSize {
  /** Page width in px (mapped 1px → 1pt at assemble time). */
  w: string;
  /** Page height in px. */
  h: string;
}

interface PageSizeSelectorProps {
  mode: PageSizeMode;
  onModeChange: (mode: PageSizeMode) => void;
  custom: CustomSize;
  onCustomChange: (next: CustomSize) => void;
  labels: {
    sizeLabel: string;
    sizeFit: string;
    sizeA4: string;
    sizeCustom: string;
    customWidth: string;
    customHeight: string;
  };
}

const OPTIONS: { value: PageSizeMode; key: "sizeFit" | "sizeA4" | "sizeCustom" }[] = [
  { value: "fit", key: "sizeFit" },
  { value: "a4", key: "sizeA4" },
  { value: "custom", key: "sizeCustom" },
];

export function PageSizeSelector({
  mode,
  onModeChange,
  custom,
  onCustomChange,
  labels,
}: PageSizeSelectorProps) {
  return (
    <div className="space-y-2">
      <p
        className="font-display text-[11px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--ink-soft)" }}
      >
        {labels.sizeLabel}
      </p>
      <div className="flex gap-1.5">
        {OPTIONS.map((opt) => {
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onModeChange(opt.value)}
              data-active={active}
              className="nameplate h-8 flex-1 rounded-[9px] px-3 font-display text-[12px] font-medium"
              style={active ? undefined : { color: "var(--ink-strong)" }}
            >
              {labels[opt.key]}
            </button>
          );
        })}
      </div>

      {mode === "custom" && (
        <div className="flex items-end gap-2">
          <label className="flex-1">
            <span
              className="mb-1 block font-display text-[11px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {labels.customWidth}
            </span>
            <input
              type="number"
              min={1}
              value={custom.w}
              onChange={(e) => onCustomChange({ ...custom, w: e.target.value })}
              className="w-full rounded-[5px] border px-2.5 py-1.5 font-display text-[12px] outline-none focus:border-[color:var(--accent-electric)] focus:ring-1 focus:ring-[color:var(--accent-electric)]"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--ink-strong)",
              }}
            />
          </label>
          <span className="pb-2 font-display text-[12px]" style={{ color: "var(--ink-soft)" }}>
            ×
          </span>
          <label className="flex-1">
            <span
              className="mb-1 block font-display text-[11px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {labels.customHeight}
            </span>
            <input
              type="number"
              min={1}
              value={custom.h}
              onChange={(e) => onCustomChange({ ...custom, h: e.target.value })}
              className="w-full rounded-[5px] border px-2.5 py-1.5 font-display text-[12px] outline-none focus:border-[color:var(--accent-electric)] focus:ring-1 focus:ring-[color:var(--accent-electric)]"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--ink-strong)",
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm exec tsc --noEmit`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/image-to-pdf/PageSizeSelector.tsx
git commit -m "feat(image-to-pdf): page-size selector (fit/A4/custom px)"
```

---

## Task 6: `ImageToPdfTopStrip` component

Thin top strip: file summary + re-upload (`.nameplate`) + convert (`.btn-primary`).

**Files:**
- Create: `src/components/tools/image-to-pdf/ImageToPdfTopStrip.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/tools/image-to-pdf/ImageToPdfTopStrip.tsx`:

```tsx
"use client";

interface ImageToPdfTopStripProps {
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

export function ImageToPdfTopStrip({
  filesSummary,
  onReupload,
  reuploadLabel,
  onConvert,
  convertLabel,
  convertDisabled,
  busy,
}: ImageToPdfTopStripProps) {
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

- [ ] **Step 2: Verify build**

Run: `pnpm exec tsc --noEmit`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/image-to-pdf/ImageToPdfTopStrip.tsx
git commit -m "feat(image-to-pdf): editor top strip"
```

---

## Task 7: `ImageToPdf` main component

The tool: image-only ingest, dnd grid (shared `PageItemCard`, no divider), page-size state, convert → single PDF.

**Files:**
- Create: `src/components/tools/image-to-pdf/ImageToPdf.tsx`

This mirrors `src/components/tools/pdf-arrange/PdfArrange.tsx` (read it as the reference). Differences: images-only ACCEPT, no split/divider, page-size state passed to the assembler, `ImageToPdfTopStrip` + `PageSizeSelector`, `ImageToPdfResult`.

- [ ] **Step 1: Create the component**

Create `src/components/tools/image-to-pdf/ImageToPdf.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ImagePlus, PlusIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { PageItemCard } from "@/components/pdf-editor/PageItemCard";
import { buildPageItems, deriveBaseName } from "@/components/pdf-editor/buildPageItems";
import { clearThumbnailCache } from "@/components/pdf-editor/thumbnailCache";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { FILE_SIZE_LIMIT } from "@/lib/constants";
import { getErrorMessage } from "@/lib/errors";
import {
  assembleSections,
  type ImageLayout,
} from "@/lib/pdf/assembleSections";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { type PageItem, type Rotation } from "@/lib/pdf/pageItem";
import { ImageToPdfResult } from "./ImageToPdfResult";
import { ImageToPdfTopStrip } from "./ImageToPdfTopStrip";
import { PageSizeSelector, type CustomSize, type PageSizeMode } from "./PageSizeSelector";
import type { ImageToPdfLabels } from "./labels";

const ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};
const ACCEPT_ATTR = "image/png,image/jpeg";

const NEUTRAL_TINT = { ring: "transparent" } as const;

export interface ImageToPdfResultData {
  bytes: Uint8Array;
  name: string;
  pageCount: number;
}

interface SortableCellProps {
  item: PageItem;
  pageNumber: number;
  bytes: Uint8Array | undefined;
  onRotate: (id: string) => void;
  onDelete: (id: string) => void;
  rotateAria: string;
  deleteAria: string;
}

function SortableCell({
  item,
  pageNumber,
  bytes,
  onRotate,
  onDelete,
  rotateAria,
  deleteAria,
}: SortableCellProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      className="flex items-stretch"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      <PageItemCard
        item={item}
        pageNumber={pageNumber}
        bytes={bytes}
        tint={NEUTRAL_TINT}
        onRotate={onRotate}
        onDelete={onDelete}
        rotateAria={rotateAria}
        deleteAria={deleteAria}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
      {/* No divider — image-to-pdf always produces one PDF. Keep the column gutter. */}
      <div className="w-[18px] shrink-0" aria-hidden="true" />
    </div>
  );
}

interface ImageToPdfProps {
  labels: ImageToPdfLabels;
  /** Locale for cross-tool handoff navigation (matches ImageResizeTool). */
  lang: string;
  inline?: boolean;
}

export function ImageToPdf({ labels, lang, inline = false }: ImageToPdfProps) {
  const router = useRouter();

  const [items, setItems] = useState<PageItem[]>([]);
  const [sourceBytesById, setSourceBytesById] = useState<Map<string, Uint8Array>>(
    new Map(),
  );
  const [loadingPages, setLoadingPages] = useState(false);
  const [sizeMode, setSizeMode] = useState<PageSizeMode>("fit");
  const [custom, setCustom] = useState<CustomSize>({ w: "595", h: "842" });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingModeRef = useRef<"replace" | "append">("append");

  const imageLayout = useMemo<ImageLayout>(() => {
    if (sizeMode === "a4") return { mode: "fixed", widthPt: 595, heightPt: 842 };
    if (sizeMode === "custom") {
      const w = Math.max(1, Math.round(Number(custom.w) || 0));
      const h = Math.max(1, Math.round(Number(custom.h) || 0));
      return { mode: "fixed", widthPt: w, heightPt: h };
    }
    return { mode: "native" };
  }, [sizeMode, custom]);

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
  } = useToolProcessor<ImageToPdfResultData>({
    processor: async (_files, onProgress) => {
      const live = items.filter((p) => !p.deleted);
      if (live.length === 0) throw new Error("변환할 이미지가 없습니다.");
      const [bytes] = await assembleSections(
        { sections: [live], sourceBytesById, imageLayout },
        onProgress,
      );
      const name = `${deriveBaseName(items[0]?.sourceFileName)}.pdf`;
      return { bytes, name, pageCount: live.length };
    },
    onDownload: (res) => downloadBlob(res.bytes, res.name, "application/pdf"),
  });

  useEffect(() => () => clearThumbnailCache(), []);

  const ingest = useCallback(
    async (incoming: File[], mode: "replace" | "append") => {
      // Images only — drop anything that isn't an accepted image.
      const images = incoming.filter((f) => f.type === "image/png" || f.type === "image/jpeg");
      for (const f of incoming) {
        if (!(f.type === "image/png" || f.type === "image/jpeg")) {
          toast.error(`${f.name}: 이미지(JPG/PNG)만 추가할 수 있습니다.`);
        }
      }
      const accepted = images.filter((f) => f.size <= FILE_SIZE_LIMIT.guest);
      for (const f of images) {
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);
      return next;
    });
  }, []);

  const hasFiles = items.length > 0;
  const busy = status === "processing";

  const filesSummary =
    files.length <= 1
      ? template(labels.filesOneTemplate, { name: files[0]?.name ?? "" })
      : template(labels.filesManyTemplate, {
          name: files[0].name,
          rest: files.length - 1,
        });

  const editor = (
    <div className="space-y-3">
      <ImageToPdfTopStrip
        filesSummary={filesSummary}
        onReupload={handleReuploadPick}
        reuploadLabel={labels.reupload}
        onConvert={run}
        convertLabel={template(labels.convertTemplate, { n: items.length })}
        convertDisabled={!hasFiles}
        busy={busy}
      />

      <PageSizeSelector
        mode={sizeMode}
        onModeChange={setSizeMode}
        custom={custom}
        onCustomChange={setCustom}
        labels={{
          sizeLabel: labels.sizeLabel,
          sizeFit: labels.sizeFit,
          sizeA4: labels.sizeA4,
          sizeCustom: labels.sizeCustom,
          customWidth: labels.customWidth,
          customHeight: labels.customHeight,
        }}
      />

      <div
        className="ob-scroll max-h-[400px] overflow-y-auto rounded-2xl p-3"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-md), inset 0 1px 0 rgba(255,255,255,0.8)",
        }}
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((p) => p.id)} strategy={rectSortingStrategy}>
            <div className="flex flex-wrap justify-center gap-0">
              {items.map((item, i) => (
                <SortableCell
                  key={item.id}
                  item={item}
                  pageNumber={i + 1}
                  bytes={sourceBytesById.get(item.sourceFileId)}
                  onRotate={handleRotate}
                  onDelete={handleDelete}
                  rotateAria={labels.rotateAria}
                  deleteAria={labels.deleteAria}
                />
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
          </SortableContext>
        </DndContext>
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
          accept={ACCEPT}
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
        <ImageToPdfResult
          result={result}
          labels={labels}
          onDownload={download}
          onCompress={() => {
            // Handoff handled inside the result via router; see ImageToPdfResult.
          }}
          onAgain={retry}
          lang={lang}
          router={router}
        />
      ) : (
        <ProcessingStatus
          status={status}
          progress={progress}
          errorMessage={errorMessage}
          onRetry={retry}
          onDownload={download}
        />
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
      <div className="flex items-start gap-3 border-b px-6 pb-3 pt-3" style={{ borderColor: "var(--border)" }}>
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-[5px]"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink-strong)" }}
        >
          <ImagePlus size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display font-ko text-[16px] font-semibold leading-[1.2] tracking-[0.005em]" style={{ color: "var(--headline)" }}>
            {labels.title}
          </div>
          <div className="mt-1 font-body text-[12px] leading-[1.45]" style={{ color: "var(--ink)" }}>
            {labels.description}
          </div>
        </div>
      </div>
      {body}
    </div>
  );
}
```

> **Note:** `useToolProcessor`'s `processor` is `(files, onProgress) => Promise<T>` and `result` is `T | null` — same shape pdf-arrange uses, so this matches. The non-inline header (title/description) renders only on the dedicated page; inline (Screen3) suppresses it because Screen3Workspace draws its own header.

- [ ] **Step 2: Verify build**

Run: `pnpm exec tsc --noEmit`
Expected: this will fail until `ImageToPdfResult` (Task 8) exists. If only the missing-module error for `./ImageToPdfResult` appears, that is expected — proceed to Task 8, then both compile. (Do not commit a non-compiling tree; commit Task 7 + 8 together at the end of Task 8.)

- [ ] **Step 3: (No commit yet — combined with Task 8.)**

---

## Task 8: `ImageToPdfResult` component (content preview + download + handoff)

**Files:**
- Create: `src/components/tools/image-to-pdf/ImageToPdfResult.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/tools/image-to-pdf/ImageToPdfResult.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { useRouter } from "next/navigation";
import { ArrowRightIcon, DownloadIcon, RotateCcwIcon } from "lucide-react";
import { PageItemCard } from "@/components/pdf-editor/PageItemCard";
import { buildPageItems } from "@/components/pdf-editor/buildPageItems";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { stageFiles } from "@/lib/common/toolHandoff";
import type { PageItem } from "@/lib/pdf/pageItem";
import type { ImageToPdfLabels } from "./labels";
import type { ImageToPdfResultData } from "./ImageToPdf";

const NEUTRAL_TINT = { ring: "transparent" } as const;

interface ImageToPdfResultProps {
  result: ImageToPdfResultData;
  labels: ImageToPdfLabels;
  onDownload: () => void;
  onCompress: () => void;
  onAgain: () => void;
  lang: string;
  router: ReturnType<typeof useRouter>;
}

export function ImageToPdfResult({
  result,
  labels,
  onDownload,
  onAgain,
  lang,
  router,
}: ImageToPdfResultProps) {
  // Build read-only page items from the actual produced PDF so the preview shows
  // the real output framing (A4 / custom letterbox), not the source images.
  const [pages, setPages] = useState<PageItem[]>([]);
  const [bytesById, setBytesById] = useState<Map<string, Uint8Array>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const file = new File([result.bytes], result.name, { type: "application/pdf" });
    void buildPageItems([file]).then((built) => {
      if (cancelled) return;
      setPages(built.items);
      setBytesById(built.sourceBytesById);
    });
    return () => {
      cancelled = true;
    };
  }, [result]);

  const handleCompress = () => {
    const file = new File([result.bytes], result.name, { type: "application/pdf" });
    stageFiles([file], "image-to-pdf");
    router.push(`/${lang}/tools/pdf-compress`);
  };

  const sizeText = useMemo(() => formatBytes(result.bytes.byteLength), [result.bytes]);

  return (
    <div className="grid min-h-[440px] grid-cols-1 gap-4 md:grid-cols-2">
      <div className="ob-scroll overflow-y-auto pr-1" style={{ maxHeight: "440px" }}>
        <div className="flex flex-wrap justify-center gap-2">
          {pages.map((p, i) => (
            <PageItemCard
              key={p.id}
              item={p}
              pageNumber={i + 1}
              bytes={bytesById.get(p.sourceFileId)}
              tint={NEUTRAL_TINT}
              onRotate={() => {}}
              onDelete={() => {}}
              rotateAria=""
              deleteAria=""
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
          {template(labels.pageCountTemplate, { n: result.pageCount })} · {sizeText}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onDownload}
            className="btn-download glint inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-4 font-display text-[12px] font-medium"
          >
            <DownloadIcon className="size-3.5" />
            {labels.download}
          </button>
          <button
            type="button"
            onClick={handleCompress}
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

> The `onCompress` prop in `ImageToPdf` is unused (handoff lives here); remove the `onCompress` prop from both the call site in `ImageToPdf.tsx` and this component's props to keep it clean. (i.e. delete the `onCompress={() => {...}}` line in Task 7's result render and the `onCompress` entry in `ImageToPdfResultProps`.)

- [ ] **Step 2: Remove the dead `onCompress` wiring in `ImageToPdf.tsx`**

In `ImageToPdf.tsx`, the `<ImageToPdfResult ... />` render: delete the `onCompress={() => { ... }}` prop line. (The result handles its own handoff via `router`.)

- [ ] **Step 3: Verify build**

Run: `pnpm exec tsc --noEmit` then `pnpm build`
Expected: green (Tasks 7 + 8 now compile together).

- [ ] **Step 4: Commit (Tasks 7 + 8)**

```bash
git add src/components/tools/image-to-pdf/ImageToPdf.tsx src/components/tools/image-to-pdf/ImageToPdfResult.tsx
git commit -m "feat(image-to-pdf): editor + result with output preview and pdf-compress handoff"
```

---

## Task 9: Wiring — Screen3 case, dedicated page, pdf-compress consumer

**Files:**
- Modify: `src/components/landing/Screen3Workspace.tsx`
- Modify: `src/app/[lang]/(chrome)/tools/image-to-pdf/page.tsx`
- Modify: `src/app/[lang]/(chrome)/tools/pdf-compress/page.tsx`

- [ ] **Step 1: Add the Screen3 renderToolBody case**

In `src/components/landing/Screen3Workspace.tsx`, add the two imports beside the other tool imports (after the `PdfArrange`/`getPdfArrangeLabels` imports, ~line 19):

```tsx
import { ImageToPdf } from "@/components/tools/image-to-pdf/ImageToPdf";
import { getImageToPdfLabels } from "@/components/tools/image-to-pdf/labels";
```

Then add a case to the `renderToolBody()` switch (the switch is on `tool.slug`; the dictionary var is `dict`; locale is `locale`), directly after the `case "image-compress":` return and before `case "pdf-arrange":`:

```tsx
      case "image-to-pdf":
        return <ImageToPdf inline labels={getImageToPdfLabels(dict)} lang={locale} />;
```

(Screen3Workspace already renders the tool's title/description header itself, so the inline body must not — `ImageToPdf inline` returns only the body.)

- [ ] **Step 2: Replace the dedicated page body**

Replace `src/app/[lang]/(chrome)/tools/image-to-pdf/page.tsx` entirely (mirrors `pdf-arrange/page.tsx` exactly — server component, dictionary load, width-constrained wrapper):

```tsx
import { getDictionary, type Locale } from "@/i18n/config";
import { locales } from "@/i18n/locales";
import { ImageToPdf } from "@/components/tools/image-to-pdf/ImageToPdf";
import { getImageToPdfLabels } from "@/components/tools/image-to-pdf/labels";

interface PageProps {
  params: Promise<{ lang: string }>;
}

function asLocale(lang: string): Locale {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : "ko";
}

export default async function ImageToPdfPage({ params }: PageProps) {
  const { lang } = await params;
  const dict = await getDictionary(asLocale(lang));
  const labels = getImageToPdfLabels(dict);

  return (
    <div
      className="mx-auto px-4 py-8"
      style={{
        width: "min(var(--tweak-workspace-width, 980px), calc(100vw - 32px))",
      }}
    >
      <ImageToPdf labels={labels} lang={lang} />
    </div>
  );
}
```

- [ ] **Step 3: Add the handoff consumer to pdf-compress**

`src/app/[lang]/(chrome)/tools/pdf-compress/page.tsx` is already a client component (`"use client"`) that owns `setFiles` from `useToolProcessor`. Make three minimal edits:

3a. Widen the React import (currently `import { useState } from "react";`):

```tsx
import { useEffect, useState } from "react";
```

3b. Add the handoff import beside the other `@/lib` imports:

```tsx
import { consumeStagedFiles } from "@/lib/common/toolHandoff";
```

3c. Add a one-shot consumer immediately after the `useToolProcessor({...})` destructure block (right before `const file = files[0];`):

```tsx
  // Load a PDF handed off from another tool (e.g. image-to-pdf). Once on mount.
  useEffect(() => {
    const staged = consumeStagedFiles();
    if (staged && staged.files.length > 0) setFiles(staged.files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

This is the only change to pdf-compress in this PR (its full silver migration is a later cycle).

- [ ] **Step 4: Verify build**

Run: `pnpm exec tsc --noEmit` then `pnpm test` then `pnpm build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/Screen3Workspace.tsx "src/app/[lang]/(chrome)/tools/image-to-pdf/page.tsx" "src/app/[lang]/(chrome)/tools/pdf-compress/page.tsx"
git commit -m "feat(image-to-pdf): wire Screen3 + dedicated page + pdf-compress handoff consumer"
```

---

## Task 10: Full verification + visual review

**Files:** none.

- [ ] **Step 1: Green gate**

Run: `pnpm exec tsc --noEmit` then `pnpm test` then `pnpm build`
Expected: all green (78 existing + new imageFit/imageLayout tests).

- [ ] **Step 2: Visual review (user runs dev server)**

Agent-side `/browse` is blocked by Windows Application Control, so ask the user to start `pnpm dev` and verify on `localhost:3000`, light + dark:
- Upload several JPG/PNG → editor shows thumbnails, drag-reorder, rotate, delete, "+" add works.
- Page-size: `이미지맞춤` (native), `A4` (portrait, image fills with white margins, no distortion), `사용자 지정` (px inputs change the page size). Rotate a sideways image and confirm it sits upright and centered in A4.
- 변환 → result: left shows the actual output PDF pages (with A4/custom framing); right card download (blue) works; **PDF 압축하기** navigates to pdf-compress with the file already loaded; 다시 resets.
- Buttons match the canonical taxonomy (convert dark, selected page-size toggle blue, download blue, secondary nameplate).
- image-to-pdf now renders inline in Screen3 (no more "open tool" link) and consistent with the other tools.

- [ ] **Step 3: Address any issues found, then this branch is PR-ready.**

---

## Self-Review notes (author)

- **Spec coverage:** dedicated-tool + reuse (Task 1, 7); image-only + single PDF (Task 7 ingest + single section); page-size fit/A4/custom px with upscale + white letterbox (Tasks 2, 3, 5); result content preview of the real output PDF (Task 8); pdf-compress handoff mirroring image-resize (Tasks 8, 9); registry already present, Screen3 + dedicated page + i18n (Tasks 4, 9). TDD on pure logic (Tasks 2, 3); UI browser-verified (Task 10).
- **Type consistency:** `ImageToPdfResultData {bytes,name,pageCount}` defined in Task 7, consumed in Task 8. `ImageLayout` defined in Task 3, used in Task 7. `PageSizeMode`/`CustomSize` defined in Task 5, used in Task 7. `computeImageFit` (Task 2) used in Task 3. Labels interface (Task 4) used in Tasks 5–8.
- **Known soft spot (call out at review):** pdf-lib rotation direction in fixed mode — the geometry is unit-tested but the ccw `rotateDeg` mapping must be visually confirmed (Task 10); if a rotated image lands mirrored/upside-down, flip `(360 - rotation) % 360` ↔ `rotation` in `computeImageFit`. (Wiring in Task 9 — Screen3 case, dedicated page, pdf-compress consumer — is pinned to the real file shapes: `Dictionary` from `@/i18n/config`, switch on `tool.slug` with `dict`/`locale`, server-component page mirroring `pdf-arrange/page.tsx`, client pdf-compress page owning `setFiles`.)
- **PR boundary:** one PR on `image-to-pdf-migration`. pdf-compress gets only the consume line (full migration later).
