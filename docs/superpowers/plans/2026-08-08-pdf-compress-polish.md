# pdf-compress Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pdf-compress live preview faithful to the real output, add hi-res zoom, a two-column divider, an in-header oversize warning, and clean up copy.

**Architecture:** Replace the unsound `extractPageOne → compress` preview with a debounced, size-gated **whole-document** compress whose result is cached and reused by the execute button (instant `done`) and whose real size replaces the model estimate. Promote `PreviewLightbox` to a shared component and open it with an on-demand hi-res page-1 render. Pure decision logic (estimate selection, preview gate) moves to `src/lib/pdf` under Vitest; UI changes are inline and verified by build + user screenshots.

**Tech Stack:** Next.js (App Router), React 19, TypeScript strict, Vitest, `@kihyun1998/justpdf-compress-wasm`, pdf-lib (being removed from this path), pdfjs.

**Spec:** `docs/superpowers/specs/2026-08-08-pdf-compress-polish-design.md`

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/lib/pdf/compressEstimate.ts` | Estimate math + `selectSizeEstimate` decision (actual vs model vs range) | Create (moves logic out of the component) |
| `src/lib/pdf/compressEstimate.test.ts` | Unit tests for the above | Create (absorbs the old component test) |
| `src/lib/pdf/livePreviewGate.ts` | `shouldPreviewCompress(fileSize, limit)` size gate | Create |
| `src/lib/pdf/livePreviewGate.test.ts` | Unit tests for the gate | Create |
| `src/components/common/PreviewLightbox.tsx` | Shared enlarge overlay (aspect optional) | Create (moved from ppt-background) |
| `src/components/tools/ppt-background/PreviewLightbox.tsx` | — | Delete (import path updated) |
| `src/components/tools/ppt-background/PptBackgroundTool.tsx` | Consumer of the lightbox | Modify (import path only) |
| `src/components/tools/pdf-compress/ComparePreview.tsx` | Preview frame (clickable → zoom) + `renderPdfFirstPage` maxScale | Modify |
| `src/components/tools/pdf-compress/PdfCompress.tsx` | Faithful preview, precompute cache, estimate wiring, zoom, header warning, divider | Modify |
| `src/components/tools/pdf-compress/PdfCompressEstimate.tsx` | Render via `selectSizeEstimate` (+ actual branch) | Modify |
| `src/components/tools/pdf-compress/PdfCompressEstimate.test.ts` | — | Delete (moved to lib) |
| `src/components/tools/pdf-compress/labels.ts` | Label interface + getter | Modify |
| `src/i18n/dictionaries/ko.json`, `en.json` | Copy | Modify |
| `docs/agents/tool-polishing-checklist.md` | Two-column divider canon (dimension E) | Modify |
| `docs/design-preview.html` | pdf-compress design record + divider canon | Modify |

---

## Task 1: Estimate selection pure logic (TDD)

**Files:**
- Create: `src/lib/pdf/compressEstimate.ts`
- Create: `src/lib/pdf/compressEstimate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/compressEstimate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { estimateCompressedSize, selectSizeEstimate } from "./compressEstimate";

describe("estimateCompressedSize", () => {
  it("clamps to the static upper bound when the formula would exceed it", () => {
    expect(estimateCompressedSize(1_000_000, 0.03, "high")).toBe(400_000);
  });
  it("clamps the low preset to its static upper bound (~90% of original)", () => {
    expect(estimateCompressedSize(1_000_000, 0, "low")).toBe(900_000);
  });
  it("shrinks medium preset proportional to image share (~50% of image bytes)", () => {
    expect(estimateCompressedSize(1_000_000, 0.5, "medium")).toBe(700_000);
  });
  it("shrinks high preset more aggressively (~35% of image bytes)", () => {
    expect(estimateCompressedSize(1_000_000, 1, "high")).toBeCloseTo(350_000, -1);
  });
  it("never returns more than the preset's static upper bound", () => {
    expect(estimateCompressedSize(1_000_000, 0, "medium")).toBeLessThanOrEqual(700_000);
    expect(estimateCompressedSize(1_000_000, 0, "high")).toBeLessThanOrEqual(400_000);
  });
});

describe("selectSizeEstimate", () => {
  it("prefers the real compressed size when a live result is present", () => {
    expect(
      selectSizeEstimate({ originalSize: 1_000_000, actualCompressedSize: 512_000, imageShare: 0.9, preset: "high" }),
    ).toEqual({ kind: "actual", size: 512_000 });
  });

  it("uses the model when no real size but image share is known and above cutoff", () => {
    const r = selectSizeEstimate({ originalSize: 1_000_000, actualCompressedSize: null, imageShare: 0.5, preset: "medium" });
    expect(r).toEqual({ kind: "model", size: 700_000 });
  });

  it("returns noChange when image share is below the preset cutoff", () => {
    const r = selectSizeEstimate({ originalSize: 1_000_000, actualCompressedSize: null, imageShare: 0.01, preset: "medium" });
    expect(r).toEqual({ kind: "noChange" });
  });

  it("low preset always reports noChange regardless of image share", () => {
    const r = selectSizeEstimate({ originalSize: 1_000_000, actualCompressedSize: null, imageShare: 1, preset: "low" });
    expect(r).toEqual({ kind: "noChange" });
  });

  it("falls back to the static range when image share is unknown", () => {
    const r = selectSizeEstimate({ originalSize: 1_000_000, actualCompressedSize: null, imageShare: null, preset: "medium" });
    expect(r).toEqual({ kind: "range", from: 400_000, to: 700_000 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/pdf/compressEstimate.test.ts`
Expected: FAIL — `Cannot find module './compressEstimate'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/pdf/compressEstimate.ts`:

```ts
import type { CompressionPreset } from "./compressPdf";

/** Reduction factor ranges [min, max] for each preset (fraction of original kept). */
const PRESET_RANGE: Record<CompressionPreset, [number, number]> = {
  low: [0.7, 0.9],
  medium: [0.4, 0.7],
  high: [0.2, 0.4],
};

/** Fraction of original image bytes left after re-encoding at this preset. */
const PRESET_IMAGE_RATIO: Record<CompressionPreset, number> = {
  low: 1.0,
  medium: 0.5,
  high: 0.35,
};

/** Minimum imageShare before the derived model estimate is shown for a preset. */
const PRESET_IMAGE_SHARE_CUTOFF: Record<CompressionPreset, number> = {
  low: Number.POSITIVE_INFINITY,
  medium: 0.05,
  high: 0.02,
};

export function estimateCompressedSize(
  originalSize: number,
  imageShare: number,
  preset: CompressionPreset,
): number {
  const presetRatio = PRESET_IMAGE_RATIO[preset];
  const formula = originalSize * (1 - imageShare * (1 - presetRatio));
  const staticUpper = originalSize * PRESET_RANGE[preset][1];
  return Math.min(formula, staticUpper);
}

export type SizeEstimate =
  | { kind: "actual"; size: number }
  | { kind: "model"; size: number }
  | { kind: "noChange" }
  | { kind: "range"; from: number; to: number };

export interface SelectSizeEstimateInput {
  originalSize: number;
  /** Real compressed size from a completed whole-doc live compress; null if none. */
  actualCompressedSize: number | null;
  /** Fraction of bytes that are images (0..1); null = analysis pending/failed. */
  imageShare: number | null;
  preset: CompressionPreset;
}

/**
 * Decide what size figure to display, in priority order:
 *  1. The real compressed size (faithful preview already ran the whole doc).
 *  2. The model estimate, when image share is known and above the preset cutoff.
 *  3. "no change", when image share is known but below the cutoff.
 *  4. The static range, when image share is unknown.
 */
export function selectSizeEstimate({
  originalSize,
  actualCompressedSize,
  imageShare,
  preset,
}: SelectSizeEstimateInput): SizeEstimate {
  if (actualCompressedSize != null) {
    return { kind: "actual", size: actualCompressedSize };
  }
  if (imageShare != null) {
    if (imageShare >= PRESET_IMAGE_SHARE_CUTOFF[preset]) {
      return { kind: "model", size: Math.round(estimateCompressedSize(originalSize, imageShare, preset)) };
    }
    return { kind: "noChange" };
  }
  const [lo, hi] = PRESET_RANGE[preset];
  return { kind: "range", from: Math.round(originalSize * lo), to: Math.round(originalSize * hi) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/pdf/compressEstimate.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/compressEstimate.ts src/lib/pdf/compressEstimate.test.ts
git commit -m "feat(pdf-compress): extract size-estimate selection to lib with actual-size branch"
```

---

## Task 2: Live-preview size gate (TDD)

**Files:**
- Create: `src/lib/pdf/livePreviewGate.ts`
- Create: `src/lib/pdf/livePreviewGate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/livePreviewGate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shouldPreviewCompress } from "./livePreviewGate";

describe("shouldPreviewCompress", () => {
  it("runs the live whole-doc compress at or below the limit", () => {
    expect(shouldPreviewCompress(5_000_000, 20_000_000)).toBe(true);
    expect(shouldPreviewCompress(20_000_000, 20_000_000)).toBe(true);
  });
  it("skips the live compress above the limit (avoids churning huge files)", () => {
    expect(shouldPreviewCompress(20_000_001, 20_000_000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/pdf/livePreviewGate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/pdf/livePreviewGate.ts`:

```ts
/**
 * Whether to run the faithful (whole-document) live compressed preview.
 *
 * The preview compresses the entire document on the main thread; above the
 * per-tool upload limit that becomes too heavy to run on every preset change,
 * so we fall back to the original preview + model estimate.
 */
export function shouldPreviewCompress(fileSize: number, limit: number): boolean {
  return fileSize <= limit;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/pdf/livePreviewGate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/livePreviewGate.ts src/lib/pdf/livePreviewGate.test.ts
git commit -m "feat(pdf-compress): add live-preview size gate"
```

---

## Task 3: Promote PreviewLightbox to a shared component

**Files:**
- Create: `src/components/common/PreviewLightbox.tsx`
- Delete: `src/components/tools/ppt-background/PreviewLightbox.tsx`
- Modify: `src/components/tools/ppt-background/PptBackgroundTool.tsx:27`

- [ ] **Step 1: Create the shared component**

Create `src/components/common/PreviewLightbox.tsx` (aspect made optional so PDF pages of any ratio work):

```tsx
"use client";

interface PreviewLightboxProps {
  /** Image URL to enlarge. */
  src: string;
  alt: string;
  /** Aspect ratio for the box, e.g. "16 / 9". Omit to size the image naturally. */
  aspect?: string;
  closeLabel: string;
  onClose: () => void;
}

export function PreviewLightbox({ src, alt, aspect, closeLabel, onClose }: PreviewLightboxProps) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center p-4"
      style={{ background: "color-mix(in oklch, var(--surface) 92%, #000)" }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-full max-w-full overflow-hidden border"
        style={{ borderColor: "var(--border)", boxShadow: "var(--shadow-lg)", ...(aspect ? { aspectRatio: aspect } : null) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="absolute right-2.5 top-2.5 flex size-8 items-center justify-center rounded-[8px] border"
        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink-strong)" }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 6 L18 18 M18 6 L6 18" />
        </svg>
      </button>
    </div>
  );
}
```

Note: the img class changed from `size-full` to `max-h-full max-w-full` so that when `aspect` is omitted the image drives the box size.

- [ ] **Step 2: Update the ppt-background import and delete the old file**

In `src/components/tools/ppt-background/PptBackgroundTool.tsx` line 27, change:

```tsx
import { PreviewLightbox } from "./PreviewLightbox";
```

to:

```tsx
import { PreviewLightbox } from "@/components/common/PreviewLightbox";
```

Then delete `src/components/tools/ppt-background/PreviewLightbox.tsx`.

- [ ] **Step 3: Verify types + ppt-background lightbox unaffected**

Run: `pnpm tsc --noEmit`
Expected: no errors. (ppt-background still passes `aspect`, so its render is unchanged.)

- [ ] **Step 4: Commit**

```bash
git add src/components/common/PreviewLightbox.tsx src/components/tools/ppt-background/PptBackgroundTool.tsx
git rm src/components/tools/ppt-background/PreviewLightbox.tsx
git commit -m "refactor(common): promote PreviewLightbox to a shared component"
```

---

## Task 4: i18n + labels

**Files:**
- Modify: `src/i18n/dictionaries/ko.json` (tools → pdf-compress → page)
- Modify: `src/i18n/dictionaries/en.json` (tools → pdf-compress → page)
- Modify: `src/components/tools/pdf-compress/labels.ts`

- [ ] **Step 1: Update ko.json**

In `src/i18n/dictionaries/ko.json`, replace the `tools["pdf-compress"].page` object with:

```json
{
  "uploadPrompt": "PDF를 드래그하거나 클릭하여 업로드",
  "uploadHint": "PDF 파일 하나만 올릴 수 있습니다.",
  "reupload": "다시 업로드",
  "fileInfo": "{name} · {size}",
  "pageCount": "{count}p",
  "oversizeBadge": "느릴 수 있음",
  "presetGroupLabel": "압축 레벨",
  "presetLightLabel": "Light",
  "presetLightDesc": "이미지 그대로 · 최소 압축",
  "presetMediumLabel": "Medium",
  "presetMediumDesc": "이미지 재인코딩 · 균형",
  "presetHeavyLabel": "Heavy",
  "presetHeavyDesc": "이미지 축소·재인코딩 · 최대",
  "compress": "압축하기",
  "processing": "압축 중…",
  "comparePreview": "압축 미리보기",
  "compareToggleAria": "압축 미리보기 전환",
  "zoomAria": "미리보기 확대",
  "lightboxClose": "닫기",
  "estimateTemplate": "예상 ~{from}–{to}",
  "estimateActualTemplate": "압축 시 {size}",
  "estimateNoChange": "~원본 크기와 유사",
  "resultTitle": "압축 결과",
  "originalSizeLabel": "원본 크기",
  "compressedSizeLabel": "압축 후",
  "savingsLabel": "절감률",
  "download": "다운로드",
  "again": "다시 하기",
  "errorMemory": "브라우저 메모리가 부족합니다. 더 작은 PDF를 사용해 주세요.",
  "errorCorrupt": "압축 결과가 손상되어 사용할 수 없습니다. 다른 압축 강도로 시도해 주세요."
}
```

(Changes: removed `uploadMaxSize`; added `pageCount`, `oversizeBadge`, `zoomAria`, `lightboxClose`; reframed the three `preset*Desc`; repurposed `estimateActualTemplate` to "압축 시 {size}".)

Note: the oversize *detail* text reuses the existing `common.fileUpload.largeFileWarning`; do not add a new one.

- [ ] **Step 2: Update en.json**

In `src/i18n/dictionaries/en.json`, replace the `tools["pdf-compress"].page` object, keeping every key present in ko.json. Use these English values for the changed/added keys (leave the other keys as their existing English text):

```json
{
  "pageCount": "{count}p",
  "oversizeBadge": "may be slow",
  "presetLightDesc": "Images untouched · minimal",
  "presetMediumDesc": "Re-encode images · balanced",
  "presetHeavyDesc": "Downscale + re-encode · maximum",
  "zoomAria": "Enlarge preview",
  "lightboxClose": "Close",
  "estimateActualTemplate": "Compresses to {size}"
}
```

Remove `uploadMaxSize` from the en.json page object as well.

- [ ] **Step 3: Update labels.ts**

In `src/components/tools/pdf-compress/labels.ts`, edit the `PdfCompressLabels` interface: remove `uploadMaxSize`, and add `pageCountTemplate`, `oversizeBadge`, `zoomAria`, `lightboxClose`. The Upload block becomes:

```ts
  // Upload
  uploadPrompt: string;
  uploadHint: string;
  reupload: string;
  // File info
  fileInfoTemplate: string;
  pageCountTemplate: string;
  oversizeBadge: string;
```

and add to the Compare/estimate block:

```ts
  zoomAria: string;
  lightboxClose: string;
```

In `getPdfCompressLabels`, remove the `uploadMaxSize` line and add:

```ts
    pageCountTemplate: p.pageCount,
    oversizeBadge: p.oversizeBadge,
    zoomAria: p.zoomAria,
    lightboxClose: p.lightboxClose,
```

- [ ] **Step 4: Verify types**

Run: `pnpm tsc --noEmit`
Expected: errors ONLY in `PdfCompress.tsx`/`PdfCompressEstimate.tsx` referencing the removed `uploadMaxSize` (there are none today) — expect no errors, since `uploadMaxSize` was unused. If tsc is clean, proceed.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/dictionaries/ko.json src/i18n/dictionaries/en.json src/components/tools/pdf-compress/labels.ts
git commit -m "chore(pdf-compress): copy cleanup — reframe presets, drop dead label, add page-count/zoom/oversize copy"
```

---

## Task 5: ComparePreview — clickable frame + hi-res render

**Files:**
- Modify: `src/components/tools/pdf-compress/ComparePreview.tsx`

- [ ] **Step 1: Add a `maxScale` param to `renderPdfFirstPage`**

In `ComparePreview.tsx`, change the signature and the scale/canvas clamps so zoom can render sharper than the inline preview:

```tsx
export async function renderPdfFirstPage(
  bytes: Uint8Array,
  targetWidth = 600,
  maxScale = 2,
): Promise<Blob> {
  const pdfjsLib = await getPdfjsLib();
  const doc = await pdfjsLib.getDocument({ data: bytes, ...pdfjsDocParams }).promise;
  try {
    const page = await doc.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(targetWidth / baseViewport.width, maxScale);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    // Clamp to avoid OOM on huge pages; the zoom path passes a larger cap.
    const MAX_CANVAS = 4096;
    canvas.width = Math.min(Math.ceil(viewport.width), MAX_CANVAS);
    canvas.height = Math.min(Math.ceil(viewport.height), MAX_CANVAS);
    await page.render({ canvas, viewport }).promise;
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
        "image/jpeg",
        0.85,
      );
    });
  } finally {
    void doc.destroy();
  }
}
```

(The inline preview keeps calling `renderPdfFirstPage(bytes.slice())` — default `maxScale = 2` preserves its current output. The `MAX_CANVAS` was 2400; 4096 lets the zoom render use more detail while still bounding memory.)

- [ ] **Step 2: Make the preview frame clickable**

Add `onZoom?: () => void` to `ComparePreviewProps`, and when a URL is shown and `onZoom` is set, render the frame as a button-like clickable region with the zoom aria label. Update the component signature and the frame:

```tsx
interface ComparePreviewProps {
  originalUrl: string | null;
  compressedUrl: string | null;
  showCompressed: boolean;
  loading?: boolean;
  onZoom?: () => void;
  zoomAria?: string;
}

export function ComparePreview({
  originalUrl,
  compressedUrl,
  showCompressed,
  loading,
  onZoom,
  zoomAria,
}: ComparePreviewProps) {
  const url = showCompressed && compressedUrl ? compressedUrl : originalUrl;
  const showCornerSpinner = loading && !!compressedUrl && showCompressed;
  const showCentreSpinner = !url;
  const zoomable = !!url && !!onZoom;

  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden rounded-[8px]"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      {url ? (
        zoomable ? (
          <button
            type="button"
            onClick={onZoom}
            aria-label={zoomAria}
            className="absolute inset-0 cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" draggable={false} className="absolute inset-0 m-auto max-h-full max-w-full object-contain" />
          </button>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" draggable={false} className="absolute inset-0 m-auto max-h-full max-w-full object-contain" />
        )
      ) : showCentreSpinner ? (
        <div className="absolute inset-0 grid place-items-center font-body text-[12px]" style={{ color: "var(--ink-soft)" }}>
          <span className="inline-block size-4 animate-spin rounded-full border-2 border-[color:var(--emphasis)] border-t-transparent" />
        </div>
      ) : null}

      {showCornerSpinner && (
        <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-[color:var(--surface)] p-1 shadow-sm opacity-80">
          <span className="block size-3 animate-spin rounded-full border-2 border-[color:var(--emphasis)] border-t-transparent" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify types**

Run: `pnpm tsc --noEmit`
Expected: no new errors (PdfCompress.tsx not yet passing `onZoom` is fine — the props are optional).

- [ ] **Step 4: Commit**

```bash
git add src/components/tools/pdf-compress/ComparePreview.tsx
git commit -m "feat(pdf-compress): clickable preview frame + hi-res render param"
```

---

## Task 6: PdfCompressEstimate — render via selectSizeEstimate

**Files:**
- Modify: `src/components/tools/pdf-compress/PdfCompressEstimate.tsx`
- Delete: `src/components/tools/pdf-compress/PdfCompressEstimate.test.ts`

- [ ] **Step 1: Rewrite the component to consume the lib + actual size**

Replace the whole body of `PdfCompressEstimate.tsx` with:

```tsx
"use client";

import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { type CompressionPreset } from "@/lib/pdf/compressPdf";
import { selectSizeEstimate } from "@/lib/pdf/compressEstimate";
import type { PdfCompressLabels } from "./labels";

interface PdfCompressEstimateProps {
  preset: CompressionPreset;
  originalSize: number;
  labels: PdfCompressLabels;
  /** Fraction of bytes that are images (0..1); null = pending/failed. */
  imageShare?: number | null;
  /** Real compressed size from a completed whole-doc live compress; null if none. */
  actualCompressedSize?: number | null;
}

export function PdfCompressEstimate({
  preset,
  originalSize,
  labels,
  imageShare,
  actualCompressedSize,
}: PdfCompressEstimateProps) {
  const descMap: Record<CompressionPreset, string> = {
    low: labels.presetLightDesc,
    medium: labels.presetMediumDesc,
    high: labels.presetHeavyDesc,
  };

  const estimate = selectSizeEstimate({
    originalSize,
    actualCompressedSize: actualCompressedSize ?? null,
    imageShare: imageShare ?? null,
    preset,
  });

  let rangeText: string;
  switch (estimate.kind) {
    case "actual":
      rangeText = template(labels.estimateActualTemplate, { size: formatBytes(estimate.size) });
      break;
    case "model":
      rangeText = template(labels.estimateActualTemplate, { size: formatBytes(estimate.size) });
      break;
    case "noChange":
      rangeText = labels.estimateNoChange;
      break;
    case "range": {
      const fromStr = formatBytes(estimate.from);
      const toStr = formatBytes(estimate.to);
      rangeText = fromStr === toStr ? fromStr : template(labels.estimateTemplate, { from: fromStr, to: toStr });
      break;
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 font-body text-[12px]" style={{ color: "var(--ink-soft)" }}>
      <span className="truncate">{descMap[preset]}</span>
      <span className="shrink-0 tabular-nums" style={{ color: "var(--ink)" }}>
        {rangeText}
      </span>
    </div>
  );
}
```

Note: `actual` and `model` both use `estimateActualTemplate` — for the model case the number is derived rather than measured, but the phrasing ("압축 시 {size}") reads correctly for both and the model case only survives for oversize (gated) files.

- [ ] **Step 2: Delete the moved test**

```bash
git rm src/components/tools/pdf-compress/PdfCompressEstimate.test.ts
```

- [ ] **Step 3: Verify types + tests**

Run: `pnpm tsc --noEmit && pnpm vitest run src/lib/pdf/compressEstimate.test.ts`
Expected: tsc clean; 10 estimate tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/tools/pdf-compress/PdfCompressEstimate.tsx
git commit -m "refactor(pdf-compress): estimate renders via selectSizeEstimate with actual size"
```

---

## Task 7: PdfCompress.tsx — faithful preview, cache, zoom, header warning, divider

**Files:**
- Modify: `src/components/tools/pdf-compress/PdfCompress.tsx`

This is the integration task. Apply the edits below in order, then verify once.

- [ ] **Step 1: Update imports**

Remove the `OversizeNotice` and `extractPageOne` imports; add the shared lightbox, the gate, and `compressPdfFromBytes`. The import block for these becomes:

```tsx
import { FileUpload } from "@/components/common/FileUpload";
import { uploadLimitFor } from "@/lib/constants";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { ToolHeader } from "@/components/common/ToolHeader";
import { PreviewLightbox } from "@/components/common/PreviewLightbox";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { consumeStagedFiles } from "@/lib/common/toolHandoff";
import { analyzePdf } from "@/lib/pdf/analyzePdf";
import {
  compressPdf,
  compressPdfFromBytes,
  type CompressionPreset,
  type CompressPdfResult,
} from "@/lib/pdf/compressPdf";
import { shouldPreviewCompress } from "@/lib/pdf/livePreviewGate";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { deriveCompressedName } from "@/lib/pdf/pdfCompressNaming";
import { ComparePreview, renderPdfFirstPage } from "./ComparePreview";
```

(Delete the old `import { OversizeNotice } ...`, `import { compressPdfLivePreview } ...` usage, and `import { extractPageOne } ...`.)

- [ ] **Step 2: Replace preview/state declarations**

Replace the state block (currently lines ~38–53) with the version below. It adds the precompute cache, the current live result, page count, and zoom state; and drops the oversize-dismiss state:

```tsx
  const [preset, setPreset] = useState<CompressionPreset>("medium");
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [showCompressed, setShowCompressed] = useState(true);
  const reuploadInputRef = useRef<HTMLInputElement | null>(null);

  // Live preview: faithful whole-doc compress of the current preset (gated by size).
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const [livePreviewLoading, setLivePreviewLoading] = useState(false);
  const [liveResult, setLiveResult] = useState<CompressPdfResult | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [imageShare, setImageShare] = useState<number | null>(null);
  const livePreviewTokenRef = useRef(0);
  // Precompute cache: preset -> whole-doc result for the CURRENT file. Cleared on file change.
  const previewCacheRef = useRef<Map<CompressionPreset, CompressPdfResult>>(new Map());

  // Zoom (hi-res lightbox) state.
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [zooming, setZooming] = useState(false);

  const filesRef = useRef<File[]>([]);
```

- [ ] **Step 3: Make the processor reuse the precompute cache**

Replace the `useToolProcessor` `processor` with a cache-aware version:

```tsx
    processor: async (processorFiles, onProgress) => {
      const cached = previewCacheRef.current.get(preset);
      if (cached) {
        // The live preview already compressed the whole doc at this preset.
        onProgress(100);
        return cached;
      }
      return compressPdf({ file: processorFiles[0], preset, onProgress });
    },
```

- [ ] **Step 4: Clear the cache + live result on file change**

Update the existing "Clear live preview when the file changes" effect to also clear the cache, page count, and live result:

```tsx
  // Reset all per-file preview state when the file changes.
  useEffect(() => {
    previewCacheRef.current = new Map();
    setLiveResult(null);
    setPageCount(null);
    setImageShare(null);
    setLivePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [file]);
```

- [ ] **Step 5: Capture page count in the analyze effect**

In the analyze effect (the one computing `imageShare`), also set page count. Replace its body's success branch so it reads:

```tsx
      try {
        const analysis = await analyzePdf(file);
        if (cancelled) return;
        setPageCount(analysis.pages);
        if (analysis.isEncrypted) {
          setImageShare(null);
          return;
        }
        setImageShare(Math.min(1, analysis.totalImageBytes / Math.max(file.size, 1)));
      } catch {
        if (!cancelled) setImageShare(null);
      }
```

- [ ] **Step 6: Replace the live-preview effect with the faithful whole-doc version**

Replace the entire "Generate a live compressed preview" effect with:

```tsx
  // Faithful live preview: compress the WHOLE document at the current preset
  // (debounced, token-guarded, size-gated), cache the result, render page 1.
  useEffect(() => {
    if (!file || status !== "idle" || !shouldPreviewCompress(file.size, uploadLimitFor("pdf-compress"))) {
      livePreviewTokenRef.current++;
      setLivePreviewLoading(false);
      if (file && status === "idle") setLiveResult(null); // gated-off: no real size
      return;
    }
    const token = ++livePreviewTokenRef.current;
    setLivePreviewLoading(true);
    const timer = setTimeout(async () => {
      let createdUrl: string | null = null;
      let committed = false;
      try {
        let result = previewCacheRef.current.get(preset);
        if (!result) {
          const ab = await file.arrayBuffer();
          result = await compressPdfFromBytes({ bytes: new Uint8Array(ab), preset });
          if (token !== livePreviewTokenRef.current) return;
          previewCacheRef.current.set(preset, result);
        }
        setLiveResult(result);
        const blob = await renderPdfFirstPage(result.data.slice());
        if (token !== livePreviewTokenRef.current) return;
        createdUrl = URL.createObjectURL(blob);
        if (token !== livePreviewTokenRef.current) return;
        setLivePreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return createdUrl;
        });
        committed = true;
      } catch {
        // Corrupt/failed compress → keep the original preview, no real size.
        if (token === livePreviewTokenRef.current) setLiveResult(null);
      } finally {
        if (createdUrl && !committed) URL.revokeObjectURL(createdUrl);
        setLivePreviewLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [file, preset, status]);
```

- [ ] **Step 7: Add the zoom handler**

Add near the other `useCallback`s:

```tsx
  const handleZoom = useCallback(async () => {
    const showingCompressed = showCompressed && (isDone ? !!compressedUrl : !!livePreviewUrl);
    setZooming(true);
    try {
      let bytes: Uint8Array;
      if (showingCompressed && isDone && result) {
        bytes = result.data.slice();
      } else if (showingCompressed && liveResult) {
        bytes = liveResult.data.slice();
      } else if (file) {
        bytes = new Uint8Array(await file.arrayBuffer());
      } else {
        return;
      }
      const blob = await renderPdfFirstPage(bytes, 1800, 4);
      const url = URL.createObjectURL(blob);
      setZoomUrl(url);
    } catch {
      // Zoom render failed — silently ignore; inline preview still works.
    } finally {
      setZooming(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCompressed, isDone, compressedUrl, livePreviewUrl, liveResult, file, result]);

  const handleZoomClose = useCallback(() => {
    setZoomUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);
```

Note: `isDone`, `result`, `compressedUrl`, `livePreviewUrl`, `liveResult`, `file` are all defined above this point — keep this block after `const isDone = ...`.

- [ ] **Step 8: Revoke the zoom URL on unmount**

Extend the unmount-only effect (the one that revokes `livePreviewUrl`) to also revoke the zoom URL:

```tsx
  useEffect(() => {
    return () => {
      livePreviewTokenRef.current++;
      setLivePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setZoomUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
    // empty deps — runs only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 9: Replace the oversize computation with a non-dismissible flag + fileInfo with page count**

Delete the `oversizeDismissed` state and `showOversize` block. Add:

```tsx
  const overLimit = !!file && file.size > uploadLimitFor("pdf-compress");

  const fileInfo = file
    ? template(labels.fileInfoTemplate, { name: file.name, size: formatBytes(file.size) }) +
      (pageCount != null ? ` · ${template(labels.pageCountTemplate, { count: String(pageCount) })}` : "")
    : "";

  const headerMeta = overLimit ? (
    <span
      className="shrink-0 whitespace-nowrap font-body text-[11px]"
      style={{ color: "var(--emphasis)" }}
      title={labels.fileUpload.largeFileWarning}
    >
      · {labels.oversizeBadge}
    </span>
  ) : undefined;
```

- [ ] **Step 10: Pass `meta` to ToolHeader**

In the `<ToolHeader ... />` element, add the `meta` prop:

```tsx
      fileSummary={fileInfo}
      meta={headerMeta}
```

- [ ] **Step 11: Remove the OversizeNotice JSX + wire preview zoom, estimate actual size, and the divider**

In the body, remove the `{showOversize && file && (<OversizeNotice ... />)}` block entirely.

Pass zoom props to `ComparePreview`:

```tsx
              <ComparePreview
                originalUrl={originalUrl}
                compressedUrl={compressedCandidate}
                showCompressed={showCompressed && showToggle}
                loading={livePreviewLoading && status === "idle"}
                onZoom={handleZoom}
                zoomAria={labels.zoomAria}
              />
```

Pass the real compressed size to the estimate (only meaningful for the current preset in idle):

```tsx
                {file && (
                  <PdfCompressEstimate
                    preset={preset}
                    originalSize={file.size}
                    labels={labels}
                    imageShare={imageShare}
                    actualCompressedSize={liveResult?.compressedSize ?? null}
                  />
                )}
```

Wrap the right-column conditional (`isDone ? ... : status === "idle" ? ... : <ProcessingStatus/>`) in a divider container. Change the right side so the three branches are children of:

```tsx
            {/* RIGHT: controls / result / status — 1px panel divider (canon) */}
            <div className="flex h-full min-h-0 flex-col md:border-l md:pl-5" style={{ borderColor: "var(--border)" }}>
              {isDone && result ? (
                <div className="self-start">
                  <PdfCompressResult
                    originalSize={result.originalSize}
                    compressedSize={result.compressedSize}
                    onDownload={download}
                    labels={labels}
                  />
                </div>
              ) : status === "idle" ? (
                <div className="flex h-full flex-col gap-3">
                  <PdfCompressControls preset={preset} onChange={setPreset} labels={labels} disabled={busy} />
                  {file && (
                    <PdfCompressEstimate
                      preset={preset}
                      originalSize={file.size}
                      labels={labels}
                      imageShare={imageShare}
                      actualCompressedSize={liveResult?.compressedSize ?? null}
                    />
                  )}
                </div>
              ) : (
                <ProcessingStatus
                  status={status}
                  progress={progress}
                  errorMessage={errorMessage}
                  onRetry={retry}
                  labels={{ processing: labels.processing }}
                />
              )}
            </div>
```

- [ ] **Step 12: Render the lightbox**

Inside the `hasFile` branch's outer `<div ... style={{ height: "var(--tray-h)" }}>`, add the lightbox as the last child so it overlays the workspace:

```tsx
          {zoomUrl && (
            <PreviewLightbox
              src={zoomUrl}
              alt=""
              closeLabel={labels.lightboxClose}
              onClose={handleZoomClose}
            />
          )}
```

(The overlay is `absolute inset-0`; ensure its positioned ancestor is the `flex flex-col gap-3` container — add `relative` to that container's className: change `className="flex flex-col gap-3"` to `className="relative flex flex-col gap-3"`.)

While `zooming` is true, the frame click already fired; no separate spinner is required, but if desired the `PreviewLightbox` only mounts once `zoomUrl` is set (after render completes), so the brief render delay shows nothing — acceptable.

- [ ] **Step 13: Verify types + build**

Run: `pnpm tsc --noEmit`
Expected: no errors.

Run: `pnpm build`
Expected: build succeeds (Turbopack; no `webpack()` config touched).

- [ ] **Step 14: Commit**

```bash
git add src/components/tools/pdf-compress/PdfCompress.tsx
git commit -m "feat(pdf-compress): faithful whole-doc preview, precompute cache, zoom, header warning, divider"
```

---

## Task 8: Docs — divider canon + design record

**Files:**
- Modify: `docs/agents/tool-polishing-checklist.md`
- Modify: `docs/design-preview.html`

- [ ] **Step 1: Add the divider canon to the checklist (dimension E)**

In `docs/agents/tool-polishing-checklist.md`, under "### E. 공통 규격 준수", add a bullet:

```markdown
- [ ] **2컬럼 워크스페이스 구분선**: 좌 프리뷰 / 우 컨트롤 레이아웃은 우측 컬럼에 `md:border-l md:pl-5`(토큰 `--border`)로 세로 구분선을 둔다(ppt-background·pdf-watermark·pdf-compress canon). 공통 컴포넌트로 빼지 않고 이 유틸 클래스를 그대로 사용.
```

- [ ] **Step 2: Record the design in design-preview.html**

In `docs/design-preview.html`, find the existing pdf-compress section (there are already pdf-compress references) and add a short static note describing: faithful whole-doc preview (why extractPageOne was removed), precompute cache, hi-res zoom lightbox, and the two-column divider. Match the file's existing section markup. If no dedicated pdf-compress section exists, append one following the pattern of the ppt-background/pdf-watermark sections.

- [ ] **Step 3: Commit**

```bash
git add docs/agents/tool-polishing-checklist.md docs/design-preview.html
git commit -m "docs(pdf-compress): record faithful-preview design + two-column divider canon"
```

---

## Task 9: Full verification + visual QA

**Files:** none (verification only)

- [ ] **Step 1: Run the full gate**

Run each and confirm green:

```bash
pnpm tsc --noEmit
pnpm build
pnpm lint
pnpm vitest run
pnpm design:check
```

Expected: all pass. If `design:check` flags a token, fix inline (no raw hex; use `var(--...)`).

- [ ] **Step 2: User visual QA (screenshots)**

Ask the user to run the dev server and exercise pdf-compress with a real church PDF (e.g. `tests/fixtures/26동계 찬양기도회.pdf`) and confirm:
  1. The live preview at Medium/Heavy now shows the page-1 image (no longer dropped) and matches the downloaded result.
  2. The size figure next to the preset reads the real compressed size.
  3. Clicking the preview opens a sharp hi-res lightbox; close works.
  4. A vertical divider separates the preview and controls columns.
  5. An oversize file shows the "느릴 수 있음" note beside the size in the header (no dismissible panel).
  6. Pressing 압축하기 completes instantly when a preview already ran (precompute cache).

- [ ] **Step 3: Self-review then ship**

Run `/review`, address findings, then `/ship` (push / PR / merge are hard stops — get user approval first).

---

## Self-Review (plan vs spec)

- **Spec §1 faithful preview** → Tasks 2 (gate), 7 (whole-doc effect, cache, processor reuse, estimate actual). ✔
- **Spec §1 estimate = actual** → Tasks 1 (`selectSizeEstimate`), 6 (component), 7 (pass `actualCompressedSize`). ✔
- **Spec §2 zoom lightbox** → Tasks 3 (promote), 5 (hi-res render + clickable), 7 (handler + render). ✔
- **Spec §3 divider** → Task 7 step 11 + Task 8 canon. ✔
- **Spec §4 header warning** → Task 7 steps 9–10. ✔
- **Spec §5 copy** → Task 4 (presets, dead label, page count) + Task 7 (fileInfo w/ pages). ✔
- **Testing** → Tasks 1, 2 (Vitest), 9 (full gate + visual QA). ✔
- **Type consistency:** `CompressPdfResult`, `CompressionPreset`, `selectSizeEstimate`, `shouldPreviewCompress`, `renderPdfFirstPage(bytes, targetWidth, maxScale)`, `PreviewLightbox` props — names used consistently across tasks. ✔
- **Out of scope** (worker, 0.1.3 bump, high-DPI model refinement) correctly omitted. ✔
