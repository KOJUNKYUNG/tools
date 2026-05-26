# pdf-compress silver migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the `pdf-compress` tool to the Ontab silver design system, add a post-compress page-1 quality compare (toggle), keep the WASM compression engine (`compressPdf.ts`) untouched.

**Architecture:** New `src/components/tools/pdf-compress/` module mirroring `image-compress` and `pdf-to-image` patterns: split into `PdfCompress` (main client + state machine + URL lifecycle), `PdfCompressControls` (preset toggles), `ComparePreview` (page-1 frame + original/compressed toggle, owns the pdfjs render helper), `PdfCompressResult` (done stats card), `labels.ts` (i18n adapter). Page-1 render uses `getPdfjsLib` with `bytes.slice()` to avoid detaching reused buffers (pitfall i). Single-PDF only; no live estimate; no outward handoff. Cross-cutting changes go to the polish backlog (convention 8).

**Tech Stack:** Next.js (App Router, `src/proxy.ts` locale), React client components, TypeScript strict, Tailwind v4 + globals.css silver tokens / 4-role buttons, pdfjs (self-hosted via `getPdfjsLib`), `@kihyun1998/justpdf-compress-wasm` (unchanged), vitest (node env, pure logic only).

**Spec:** `docs/superpowers/specs/2026-05-26-ontab-phase-1-pdf-compress-design.md`

**Branch:** `feat/ontab-phase-1-pdf-compress` (already created, spec committed at `dcfee91`).

---

## File map

**Create:**
- `src/lib/pdf/pdfCompressNaming.ts` — `deriveCompressedName` pure helper.
- `src/lib/pdf/pdfCompressNaming.test.ts` — vitest, 5 cases.
- `src/components/tools/pdf-compress/labels.ts` — `PdfCompressLabels` + `getPdfCompressLabels(dict)`.
- `src/components/tools/pdf-compress/PdfCompressControls.tsx` — preset toggle group.
- `src/components/tools/pdf-compress/ComparePreview.tsx` — page-1 frame + original/compressed checkbox; owns the `renderPdfFirstPage` helper.
- `src/components/tools/pdf-compress/PdfCompressResult.tsx` — done state stats card + download/again buttons.
- `src/components/tools/pdf-compress/PdfCompress.tsx` — main client; useToolProcessor, URL lifecycle, idle/processing/done 2-col grid, inline + page-chrome variants.

**Modify:**
- `src/i18n/dictionaries/ko.json` — add `tools.pdf-compress.page` block.
- `src/i18n/dictionaries/en.json` — add `tools.pdf-compress.page` block.
- `src/app/[lang]/(chrome)/tools/pdf-compress/page.tsx` — rewrite (load dict, render `<PdfCompress />`).
- `src/components/landing/Screen3Workspace.tsx` — add import + `case "pdf-compress"` in `renderToolBody()`.

**Untouched:**
- `src/lib/pdf/compressPdf.ts` — engine, reused as-is.
- `src/lib/common/toolHandoff.ts`, `useToolProcessor.ts`, `FileUpload`, `ProcessingStatus`, `formatBytes`, `downloadBlob`, `computeSavings` — all reused as-is.

---

## Task 1: Pure naming helper (TDD)

**Files:**
- Create: `src/lib/pdf/pdfCompressNaming.ts`
- Test: `src/lib/pdf/pdfCompressNaming.test.ts`

- [ ] **Step 1.1: Write the failing test**

`src/lib/pdf/pdfCompressNaming.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveCompressedName } from "./pdfCompressNaming";

describe("deriveCompressedName", () => {
  it("appends -compressed before a lowercase .pdf extension", () => {
    expect(deriveCompressedName("report.pdf")).toBe("report-compressed.pdf");
  });

  it("normalizes an uppercase .PDF extension to lowercase", () => {
    expect(deriveCompressedName("report.PDF")).toBe("report-compressed.pdf");
  });

  it("appends -compressed.pdf when there is no extension", () => {
    expect(deriveCompressedName("no-ext")).toBe("no-ext-compressed.pdf");
  });

  it("falls back to compressed.pdf for an empty name", () => {
    expect(deriveCompressedName("")).toBe("compressed.pdf");
  });

  it("strips only the trailing .pdf for multi-dot names", () => {
    expect(deriveCompressedName("a.b.pdf")).toBe("a.b-compressed.pdf");
  });
});
```

- [ ] **Step 1.2: Run the test and confirm it fails**

Run: `pnpm test -- pdfCompressNaming`
Expected: FAIL — `deriveCompressedName` is not defined / module not found.

- [ ] **Step 1.3: Implement the helper**

`src/lib/pdf/pdfCompressNaming.ts`:

```ts
/**
 * Build a friendly download filename for a compressed PDF.
 *
 * - `"report.pdf"` → `"report-compressed.pdf"`
 * - `"report.PDF"` → `"report-compressed.pdf"` (extension lower-cased on output)
 * - `"no-ext"`     → `"no-ext-compressed.pdf"`
 * - `""`           → `"compressed.pdf"` (matches the pre-migration hardcoded value)
 * - `"a.b.pdf"`    → `"a.b-compressed.pdf"` (only the trailing `.pdf` is stripped)
 */
export function deriveCompressedName(originalName: string): string {
  if (!originalName) return "compressed.pdf";
  const lower = originalName.toLowerCase();
  const base = lower.endsWith(".pdf")
    ? originalName.slice(0, -4)
    : originalName;
  return `${base}-compressed.pdf`;
}
```

- [ ] **Step 1.4: Run the test and confirm it passes**

Run: `pnpm test -- pdfCompressNaming`
Expected: PASS — 5 / 5.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/pdf/pdfCompressNaming.ts src/lib/pdf/pdfCompressNaming.test.ts
git commit -m "feat(pdf-compress): add deriveCompressedName naming helper"
```

---

## Task 2: i18n dictionary entries (KO + EN)

**Files:**
- Modify: `src/i18n/dictionaries/ko.json` — extend `tools."pdf-compress"` with a `page` block.
- Modify: `src/i18n/dictionaries/en.json` — same shape, translated.

- [ ] **Step 2.1: Add the KO `page` block**

In `src/i18n/dictionaries/ko.json`, replace the existing `tools."pdf-compress"` object:

```json
"pdf-compress": {
  "title": "PDF 용량 줄이기",
  "description": "품질 손실 없이 파일 크기를 줄입니다.",
  "page": {
    "uploadPrompt": "PDF를 끌어다 놓거나 클릭하여 업로드",
    "uploadHint": "단일 PDF 파일을 선택하세요.",
    "uploadMaxSize": "최대 100MB",
    "reupload": "다시 업로드",
    "reset": "다시 시작",
    "fileInfo": "{name} · {size}",
    "presetGroupLabel": "압축 레벨",
    "presetLightLabel": "Light",
    "presetLightDesc": "화질 유지, 10–30% 감소",
    "presetMediumLabel": "Medium",
    "presetMediumDesc": "범용, 30–60% 감소",
    "presetHeavyLabel": "Heavy",
    "presetHeavyDesc": "강한 압축, 60–80% 감소",
    "compress": "PDF 압축하기",
    "processing": "압축 중…",
    "compareOriginal": "원본",
    "compareCompressed": "압축",
    "compareToggleAria": "원본/압축 비교",
    "resultTitle": "압축 결과",
    "originalSizeLabel": "원본 크기",
    "compressedSizeLabel": "압축 후",
    "savingsLabel": "절감률",
    "download": "다운로드",
    "again": "다시 압축",
    "errorMemory": "브라우저 메모리가 부족합니다. 더 작은 PDF를 사용해 주세요."
  }
}
```

(Keep `uploadMaxSize` aligned with what other tools display — copy the exact phrasing from `tools."pdf-to-image".page.uploadMaxSize` if it differs from "최대 100MB".)

- [ ] **Step 2.2: Add the EN `page` block**

In `src/i18n/dictionaries/en.json`, replace the existing `tools."pdf-compress"` object with the same shape, translated:

```json
"pdf-compress": {
  "title": "Compress PDF",
  "description": "Shrink file size without losing quality.",
  "page": {
    "uploadPrompt": "Drag and drop a PDF, or click to upload",
    "uploadHint": "Select a single PDF file.",
    "uploadMaxSize": "Up to 100MB",
    "reupload": "Re-upload",
    "reset": "Start over",
    "fileInfo": "{name} · {size}",
    "presetGroupLabel": "Compression level",
    "presetLightLabel": "Light",
    "presetLightDesc": "Preserve quality, 10–30% smaller",
    "presetMediumLabel": "Medium",
    "presetMediumDesc": "Balanced, 30–60% smaller",
    "presetHeavyLabel": "Heavy",
    "presetHeavyDesc": "Aggressive, 60–80% smaller",
    "compress": "Compress PDF",
    "processing": "Compressing…",
    "compareOriginal": "Original",
    "compareCompressed": "Compressed",
    "compareToggleAria": "Compare original and compressed",
    "resultTitle": "Compression result",
    "originalSizeLabel": "Original size",
    "compressedSizeLabel": "After",
    "savingsLabel": "Savings",
    "download": "Download",
    "again": "Compress again",
    "errorMemory": "Browser ran out of memory. Try a smaller PDF."
  }
}
```

- [ ] **Step 2.3: Verify the Dictionary type compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS. (`Dictionary` is the inferred shape of the KO JSON; the EN file must match it.)

If the type-check surfaces a mismatch with another tool's `page` shape (e.g. `uploadMaxSize` missing somewhere), fix the matching key — do NOT widen the type.

- [ ] **Step 2.4: Commit**

```bash
git add src/i18n/dictionaries/ko.json src/i18n/dictionaries/en.json
git commit -m "i18n(pdf-compress): add page block for silver migration"
```

---

## Task 3: Labels adapter

**Files:**
- Create: `src/components/tools/pdf-compress/labels.ts`

- [ ] **Step 3.1: Write the labels module**

`src/components/tools/pdf-compress/labels.ts`:

```ts
import type { Dictionary } from "@/i18n/config";

export interface PdfCompressLabels {
  // Header (used by page chrome variant)
  title: string;
  description: string;
  // Upload
  uploadPrompt: string;
  uploadHint: string;
  uploadMaxSize: string;
  reupload: string;
  reset: string;
  // File info
  fileInfoTemplate: string;
  // Preset group
  presetGroupLabel: string;
  presetLightLabel: string;
  presetLightDesc: string;
  presetMediumLabel: string;
  presetMediumDesc: string;
  presetHeavyLabel: string;
  presetHeavyDesc: string;
  // Action
  compress: string;
  processing: string;
  // Compare
  compareOriginal: string;
  compareCompressed: string;
  compareToggleAria: string;
  // Result
  resultTitle: string;
  originalSizeLabel: string;
  compressedSizeLabel: string;
  savingsLabel: string;
  download: string;
  again: string;
  // Errors
  errorMemory: string;
}

export function getPdfCompressLabels(dict: Dictionary): PdfCompressLabels {
  const t = dict.tools["pdf-compress"];
  const p = t.page;
  return {
    title: t.title,
    description: t.description,
    uploadPrompt: p.uploadPrompt,
    uploadHint: p.uploadHint,
    uploadMaxSize: p.uploadMaxSize,
    reupload: p.reupload,
    reset: p.reset,
    fileInfoTemplate: p.fileInfo,
    presetGroupLabel: p.presetGroupLabel,
    presetLightLabel: p.presetLightLabel,
    presetLightDesc: p.presetLightDesc,
    presetMediumLabel: p.presetMediumLabel,
    presetMediumDesc: p.presetMediumDesc,
    presetHeavyLabel: p.presetHeavyLabel,
    presetHeavyDesc: p.presetHeavyDesc,
    compress: p.compress,
    processing: p.processing,
    compareOriginal: p.compareOriginal,
    compareCompressed: p.compareCompressed,
    compareToggleAria: p.compareToggleAria,
    resultTitle: p.resultTitle,
    originalSizeLabel: p.originalSizeLabel,
    compressedSizeLabel: p.compressedSizeLabel,
    savingsLabel: p.savingsLabel,
    download: p.download,
    again: p.again,
    errorMemory: p.errorMemory,
  };
}
```

- [ ] **Step 3.2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3.3: Commit**

```bash
git add src/components/tools/pdf-compress/labels.ts
git commit -m "feat(pdf-compress): add labels adapter"
```

---

## Task 4: PdfCompressControls — preset toggle group

**Files:**
- Create: `src/components/tools/pdf-compress/PdfCompressControls.tsx`

Pattern lifted from `PdfToImageControls.tsx`. Three `nameplate[data-active]` toggles stacked or in a row, each with a label + a 1-line description.

- [ ] **Step 4.1: Write the component**

`src/components/tools/pdf-compress/PdfCompressControls.tsx`:

```tsx
"use client";

import type { CompressionPreset } from "@/lib/pdf/compressPdf";
import type { PdfCompressLabels } from "./labels";

interface PdfCompressControlsProps {
  preset: CompressionPreset;
  onChange: (preset: CompressionPreset) => void;
  labels: PdfCompressLabels;
  disabled?: boolean;
}

const GROUP_LABEL =
  "font-display text-[11px] font-medium uppercase tracking-[0.08em]";

export function PdfCompressControls({
  preset,
  onChange,
  labels,
  disabled = false,
}: PdfCompressControlsProps) {
  const options: { value: CompressionPreset; label: string; desc: string }[] = [
    {
      value: "low",
      label: labels.presetLightLabel,
      desc: labels.presetLightDesc,
    },
    {
      value: "medium",
      label: labels.presetMediumLabel,
      desc: labels.presetMediumDesc,
    },
    {
      value: "high",
      label: labels.presetHeavyLabel,
      desc: labels.presetHeavyDesc,
    },
  ];

  return (
    <div className="space-y-2">
      <p className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
        {labels.presetGroupLabel}
      </p>
      <div className="flex flex-col gap-1.5">
        {options.map((opt) => {
          const active = preset === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              data-active={active}
              disabled={disabled}
              className="nameplate flex w-full items-center justify-between gap-3 rounded-[9px] px-3 py-2 text-left font-display text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
              style={active ? undefined : { color: "var(--ink-strong)" }}
            >
              <span>{opt.label}</span>
              <span
                className="font-body text-[11px] font-normal"
                style={{
                  color: active
                    ? "color-mix(in oklch, currentColor 80%, transparent)"
                    : "var(--ink-soft)",
                }}
              >
                {opt.desc}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4.2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4.3: Commit**

```bash
git add src/components/tools/pdf-compress/PdfCompressControls.tsx
git commit -m "feat(pdf-compress): add PdfCompressControls preset toggle group"
```

---

## Task 5: ComparePreview — page-1 frame + render helper + toggle

**Files:**
- Create: `src/components/tools/pdf-compress/ComparePreview.tsx`

This module owns the `renderPdfFirstPage` helper (DOM/canvas — not pure, not unit-tested). The component renders the preview frame; the *parent* (`PdfCompress`) owns object URLs and decides whether the checkbox is shown.

- [ ] **Step 5.1: Write the component + helper**

`src/components/tools/pdf-compress/ComparePreview.tsx`:

```tsx
"use client";

import { getPdfjsLib, pdfjsDocParams } from "@/lib/pdf/pdfjs";

interface ComparePreviewProps {
  /** Original PDF page-1 preview URL (always available once the file is loaded). */
  originalUrl: string | null;
  /** Compressed PDF page-1 preview URL (only in "done" state). */
  compressedUrl: string | null;
  /** Whether to show the original/compressed toggle. */
  showToggle: boolean;
  /** Whether the compressed preview is currently shown (vs original). */
  showCompressed: boolean;
  onToggle: (showCompressed: boolean) => void;
  labels: {
    compareOriginal: string;
    compareCompressed: string;
    compareToggleAria: string;
  };
}

export function ComparePreview({
  originalUrl,
  compressedUrl,
  showToggle,
  showCompressed,
  onToggle,
  labels,
}: ComparePreviewProps) {
  const url =
    showToggle && showCompressed && compressedUrl ? compressedUrl : originalUrl;

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Toggle slot — reserved space so the frame does not shift between idle/done */}
      <div className="flex h-7 items-center justify-end">
        {showToggle && compressedUrl ? (
          <label
            className="inline-flex cursor-pointer items-center gap-1.5 font-display text-[11px]"
            style={{ color: "var(--ink-strong)" }}
          >
            <input
              type="checkbox"
              checked={showCompressed}
              onChange={(e) => onToggle(e.target.checked)}
              aria-label={labels.compareToggleAria}
              style={{ accentColor: "var(--accent-electric)" }}
            />
            <span style={{ color: "var(--ink-soft)" }}>
              {labels.compareOriginal}
            </span>
            <span>/</span>
            <span>{labels.compareCompressed}</span>
          </label>
        ) : null}
      </div>

      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-[8px]"
        style={{
          background: "var(--silver-100)",
          border: "1px solid var(--silver-200)",
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            draggable={false}
            className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
          />
        ) : (
          <div
            className="absolute inset-0 grid place-items-center font-body text-[12px]"
            style={{ color: "var(--ink-soft)" }}
          >
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-[color:var(--accent-electric)] border-t-transparent" />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Render page 1 of a PDF to a JPEG blob via pdfjs.
 *
 * IMPORTANT — pitfall i (pdfjs ArrayBuffer detach):
 * pdfjs transfers `data` to its worker and detaches the original buffer.
 * The caller MUST pass a `bytes.slice()` copy when the source bytes are
 * reused elsewhere (the uploaded `File` is read again on compression; the
 * WASM `result.data` is reused for download).
 */
export async function renderPdfFirstPage(
  bytes: Uint8Array,
  targetWidth = 600,
): Promise<Blob> {
  const pdfjsLib = await getPdfjsLib();
  const doc = await pdfjsLib.getDocument({ data: bytes, ...pdfjsDocParams })
    .promise;
  try {
    const page = await doc.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(targetWidth / baseViewport.width, 2);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    // Clamp to avoid OOM on huge pages (pitfall: pdf-to-image F1).
    canvas.width = Math.min(Math.ceil(viewport.width), 2400);
    canvas.height = Math.min(Math.ceil(viewport.height), 2400);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2D context unavailable");
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
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

- [ ] **Step 5.2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

If the `page.render` signature differs in this pdfjs version (some versions don't accept `canvas` in the params), drop the `canvas` field — `canvasContext` + `viewport` are the required pair. Cross-check against `src/lib/pdf/pdfToImage.ts` for the exact call shape used in this repo.

- [ ] **Step 5.3: Commit**

```bash
git add src/components/tools/pdf-compress/ComparePreview.tsx
git commit -m "feat(pdf-compress): add ComparePreview + page-1 pdfjs render helper"
```

---

## Task 6: PdfCompressResult — done-state stats card

**Files:**
- Create: `src/components/tools/pdf-compress/PdfCompressResult.tsx`

Mirrors the right-column accent-bar card from `PdfToImageResult.tsx`.

- [ ] **Step 6.1: Write the component**

`src/components/tools/pdf-compress/PdfCompressResult.tsx`:

```tsx
"use client";

import { DownloadIcon, RotateCcwIcon } from "lucide-react";
import { formatBytes } from "@/lib/common/formatBytes";
import { computeSavings } from "@/lib/image/computeSavings";
import type { PdfCompressLabels } from "./labels";

interface PdfCompressResultProps {
  originalSize: number;
  compressedSize: number;
  onDownload: () => void;
  onAgain: () => void;
  labels: PdfCompressLabels;
}

export function PdfCompressResult({
  originalSize,
  compressedSize,
  onDownload,
  onAgain,
  labels,
}: PdfCompressResultProps) {
  const { pct } = computeSavings(originalSize, compressedSize);

  return (
    <div
      className="flex h-full flex-col gap-3 rounded-[8px] border p-4"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "inset 2px 0 0 var(--accent-electric)",
      }}
    >
      <div
        className="font-display text-[13px] font-semibold"
        style={{ color: "var(--headline)" }}
      >
        {labels.resultTitle}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p
            className="font-body text-[11px]"
            style={{ color: "var(--ink-soft)" }}
          >
            {labels.originalSizeLabel}
          </p>
          <p
            className="font-display text-[14px] font-semibold tabular-nums"
            style={{ color: "var(--ink-strong)" }}
          >
            {formatBytes(originalSize)}
          </p>
        </div>
        <div>
          <p
            className="font-body text-[11px]"
            style={{ color: "var(--ink-soft)" }}
          >
            {labels.compressedSizeLabel}
          </p>
          <p
            className="font-display text-[14px] font-semibold tabular-nums"
            style={{ color: "var(--ink-strong)" }}
          >
            {formatBytes(compressedSize)}
          </p>
        </div>
        <div>
          <p
            className="font-body text-[11px]"
            style={{ color: "var(--ink-soft)" }}
          >
            {labels.savingsLabel}
          </p>
          <p
            className="font-display text-[14px] font-semibold tabular-nums"
            style={{ color: "var(--accent-electric)" }}
          >
            {pct}%
          </p>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onDownload}
          className="btn-download glint inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[9px] px-4 font-display text-[12px] font-medium"
        >
          <DownloadIcon className="size-3.5" />
          {labels.download}
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
  );
}
```

- [ ] **Step 6.2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 6.3: Commit**

```bash
git add src/components/tools/pdf-compress/PdfCompressResult.tsx
git commit -m "feat(pdf-compress): add PdfCompressResult stats card"
```

---

## Task 7: PdfCompress — main client (state + wiring + chrome)

**Files:**
- Create: `src/components/tools/pdf-compress/PdfCompress.tsx`

This is the biggest task. It composes the previous three, owns the state machine + URL lifecycle + page chrome, and wires the existing `compressPdf` engine through `useToolProcessor`.

- [ ] **Step 7.1: Write the main component**

`src/components/tools/pdf-compress/PdfCompress.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArchiveIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { consumeStagedFiles } from "@/lib/common/toolHandoff";
import {
  compressPdf,
  type CompressionPreset,
  type CompressPdfResult,
} from "@/lib/pdf/compressPdf";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { deriveCompressedName } from "@/lib/pdf/pdfCompressNaming";
import { ComparePreview, renderPdfFirstPage } from "./ComparePreview";
import { PdfCompressControls } from "./PdfCompressControls";
import { PdfCompressResult } from "./PdfCompressResult";
import type { PdfCompressLabels } from "./labels";

const PDF_ACCEPT = { "application/pdf": [".pdf"] };

interface PdfCompressProps {
  labels: PdfCompressLabels;
  inline?: boolean;
}

export function PdfCompress({ labels, inline = false }: PdfCompressProps) {
  const [preset, setPreset] = useState<CompressionPreset>("medium");
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [showCompressed, setShowCompressed] = useState(true);
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
  } = useToolProcessor<CompressPdfResult>({
    processor: (files, onProgress) =>
      compressPdf({ file: files[0], preset, onProgress }),
    onDownload: (res) =>
      downloadBlob(
        res.data,
        deriveCompressedName(files[0]?.name ?? ""),
        "application/pdf",
      ),
    errorOptions: { memoryHint: labels.errorMemory },
  });

  const file = files[0];

  // Consume cross-tool handoff (e.g. from image-to-pdf). Once on mount.
  useEffect(() => {
    const staged = consumeStagedFiles();
    if (staged && staged.files.length > 0) setFiles(staged.files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render the original-PDF page-1 preview whenever the file changes.
  // Pass `bytes.slice()` (inside renderPdfFirstPage we don't slice — caller's
  // responsibility per the helper's contract) to avoid detaching the file
  // bytes; though `file.arrayBuffer()` returns a fresh buffer each call, we
  // still slice as defense in depth.
  useEffect(() => {
    if (!file) {
      setOriginalUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const ab = await file.arrayBuffer();
        const bytes = new Uint8Array(ab);
        const blob = await renderPdfFirstPage(bytes.slice());
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setOriginalUrl(createdUrl);
      } catch {
        if (!cancelled) {
          setOriginalUrl(null);
          // Render failure is not fatal — compression still works.
        }
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [file]);

  // Render the compressed-PDF page-1 preview whenever a new result arrives.
  // `result.data` is reused by downloadBlob → MUST slice() to keep it intact.
  useEffect(() => {
    if (!result) {
      setCompressedUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const blob = await renderPdfFirstPage(result.data.slice());
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setCompressedUrl(createdUrl);
        setShowCompressed(true);
      } catch {
        if (!cancelled) setCompressedUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [result]);

  const handleFilesChange = useCallback(
    (newFiles: File[]) => {
      retry();
      setFiles(newFiles.slice(0, 1));
      setShowCompressed(true);
    },
    [retry, setFiles],
  );

  const handleReupload = useCallback(
    () => reuploadInputRef.current?.click(),
    [],
  );

  const handleHiddenInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (status === "processing") {
        e.target.value = "";
        return;
      }
      const picked = e.target.files ? Array.from(e.target.files) : [];
      if (picked.length > 0) handleFilesChange(picked);
      e.target.value = "";
    },
    [handleFilesChange, status],
  );

  const onReset = useCallback(() => {
    handleFilesChange([]);
    setPreset("medium");
  }, [handleFilesChange]);

  const handleAgain = useCallback(() => {
    retry();
    setShowCompressed(true);
  }, [retry]);

  const hasFile = !!file;
  const busy = status === "processing";
  const isDone = status === "done" && !!result;

  const fileInfo = file
    ? template(labels.fileInfoTemplate, {
        name: file.name,
        size: formatBytes(file.size),
      })
    : "";

  const body = (
    <div className={inline ? "space-y-4" : "space-y-4 px-6 py-3"}>
      <input
        ref={reuploadInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleHiddenInputChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {!hasFile ? (
        <FileUpload
          accept={PDF_ACCEPT}
          multiple={false}
          hideFileList
          onFiles={handleFilesChange}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={{ maxSize: labels.uploadMaxSize }}
        />
      ) : (
        <div
          className="grid grid-cols-1 gap-5 md:grid-cols-2"
          style={{ height: "52vh" }}
        >
          <ComparePreview
            originalUrl={originalUrl}
            compressedUrl={compressedUrl}
            showToggle={isDone}
            showCompressed={showCompressed}
            onToggle={setShowCompressed}
            labels={{
              compareOriginal: labels.compareOriginal,
              compareCompressed: labels.compareCompressed,
              compareToggleAria: labels.compareToggleAria,
            }}
          />

          {isDone && result ? (
            <PdfCompressResult
              originalSize={result.originalSize}
              compressedSize={result.compressedSize}
              onDownload={download}
              onAgain={handleAgain}
              labels={labels}
            />
          ) : status === "idle" ? (
            <div className="flex flex-col gap-3">
              <PdfCompressControls
                preset={preset}
                onChange={setPreset}
                labels={labels}
                disabled={busy}
              />
              <div
                className="truncate font-body text-[12px]"
                style={{ color: "var(--ink-soft)" }}
                title={fileInfo}
              >
                {fileInfo}
              </div>
              <button
                type="button"
                onClick={handleFileExists(file, run, labels)}
                className="btn-primary glint inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[9px] px-4 font-display text-[13px] font-semibold"
              >
                {labels.compress}
              </button>
              <button
                type="button"
                onClick={handleReupload}
                disabled={busy}
                className="nameplate inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[9px] px-3 font-display text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ color: "var(--ink-strong)" }}
              >
                {labels.reupload}
              </button>
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
        disabled={busy}
        aria-label={labels.reset}
        title={labels.reset}
        className="absolute right-6 top-4 z-10 rounded-md p-1.5 transition-colors hover:text-[color:var(--ink-strong)] disabled:cursor-not-allowed disabled:opacity-50"
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
          <ArchiveIcon size={18} />
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

// Defensive: the run button is only rendered when `file` exists, but keep the
// guard so a future caller change can't silently invoke compressPdf with no input.
function handleFileExists(
  file: File | undefined,
  run: () => void,
  labels: PdfCompressLabels,
): () => void {
  return () => {
    if (!file) {
      toast.error(labels.uploadPrompt);
      return;
    }
    run();
  };
}
```

- [ ] **Step 7.2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

Common failures + fixes:
- `useToolProcessor` `errorOptions.memoryHint` field name differs → cross-check `src/hooks/useToolProcessor.ts` and use the exact prop name (the `pdf-to-image` code uses `errorOptions: { memoryHint: "..." }`).
- `FileUpload` `labels.maxSize` field — confirm against `pdf-to-image` usage.
- `ProcessingStatus` `labels.processing` — confirm against `pdf-to-image` usage.
- If the existing `Dictionary` type does not have `tools["pdf-compress"].page` after Task 2, re-run Task 2.

- [ ] **Step 7.3: Commit**

```bash
git add src/components/tools/pdf-compress/PdfCompress.tsx
git commit -m "feat(pdf-compress): add PdfCompress main client (state + chrome)"
```

---

## Task 8: Rewrite the route page

**Files:**
- Modify: `src/app/[lang]/(chrome)/tools/pdf-compress/page.tsx`

- [ ] **Step 8.1: Replace the file contents**

`src/app/[lang]/(chrome)/tools/pdf-compress/page.tsx`:

```tsx
import { getDictionary, type Locale } from "@/i18n/config";
import { locales } from "@/i18n/locales";
import { PdfCompress } from "@/components/tools/pdf-compress/PdfCompress";
import { getPdfCompressLabels } from "@/components/tools/pdf-compress/labels";

interface PageProps {
  params: Promise<{ lang: string }>;
}

function asLocale(lang: string): Locale {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : "ko";
}

export default async function PdfCompressPage({ params }: PageProps) {
  const { lang } = await params;
  const dict = await getDictionary(asLocale(lang));
  const labels = getPdfCompressLabels(dict);

  return (
    <div
      className="mx-auto px-4 py-8"
      style={{
        width: "min(var(--tweak-workspace-width, 980px), calc(100vw - 32px))",
      }}
    >
      <PdfCompress labels={labels} />
    </div>
  );
}
```

- [ ] **Step 8.2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 8.3: Commit**

```bash
git add "src/app/[lang]/(chrome)/tools/pdf-compress/page.tsx"
git commit -m "feat(pdf-compress): rewrite route page to mount silver client"
```

---

## Task 9: Wire Screen3 inline mount

**Files:**
- Modify: `src/components/landing/Screen3Workspace.tsx` — add import + switch case for `pdf-compress`, replacing the bridge.

- [ ] **Step 9.1: Add imports near the existing tool imports**

Locate the block in `src/components/landing/Screen3Workspace.tsx` that imports `PdfToImage` and `getPdfToImageLabels` (around lines 22-23 per the current snapshot). Add directly below:

```tsx
import { PdfCompress } from "@/components/tools/pdf-compress/PdfCompress";
import { getPdfCompressLabels } from "@/components/tools/pdf-compress/labels";
```

- [ ] **Step 9.2: Add the switch case**

In `renderToolBody()`, locate the existing `case "pdf-to-image":` line and add immediately below it (before `case "pdf-arrange":`):

```tsx
      case "pdf-compress":
        return <PdfCompress inline labels={getPdfCompressLabels(dict)} />;
```

- [ ] **Step 9.3: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 9.4: Commit**

```bash
git add src/components/landing/Screen3Workspace.tsx
git commit -m "feat(pdf-compress): mount inline in Screen3 workspace (replace bridge)"
```

---

## Task 10: Final static verification

- [ ] **Step 10.1: Run the unit test suite**

Run: `pnpm test`
Expected: PASS — all existing tests + the new `pdfCompressNaming` cases.

- [ ] **Step 10.2: Run the production build**

Run: `pnpm build`
Expected: PASS — no type errors, no Next.js build errors.

If `pnpm build` flags a server/client boundary issue (pitfall e), confirm `PdfCompress.tsx`, `PdfCompressControls.tsx`, `ComparePreview.tsx`, `PdfCompressResult.tsx` all have `"use client";` at the top. The `page.tsx` is a server component and must not forward functions to the client component.

- [ ] **Step 10.3: Hand off to the user for visual verification**

Tell the user the implementation is ready. The user will run `pnpm dev` and verify:

1. `/ko/tools/pdf-compress` standalone page renders with silver chrome + correct copy.
2. `/en/tools/pdf-compress` standalone page renders with EN copy.
3. Inline mount from Screen3 (open the workspace tray and pick "PDF 용량 줄이기") renders the same body without page chrome.
4. Cross-tool handoff: image-to-pdf → "Compress" → lands on pdf-compress with the PDF pre-loaded (preview, preset toggles, compress button visible).
5. Each preset (Light / Medium / Heavy) completes successfully on a sample PDF; the original/compressed toggle visibly changes the page-1 frame on Heavy.
6. Reset (top-right) and re-upload mid-flow both clear state cleanly.
7. No layout shift between idle / processing / done or when flipping the compare toggle.
8. Stats card numbers match `result.originalSize` / `result.compressedSize` and the savings % is computed from `computeSavings`.

Do NOT push or open a PR until the user confirms the visual verification (hard stop per `CLAUDE.md`).

---

## Self-review notes (already applied)

- **Spec coverage:** Tasks 1–9 cover every spec section (naming helper, i18n, controls, compare, result card, main client, page route, Screen3 wiring). Task 10 is verification.
- **Placeholders:** none.
- **Type consistency:** `CompressionPreset` is imported from `@/lib/pdf/compressPdf` everywhere; `PdfCompressLabels` is consistent across all consumers; `CompressPdfResult` (with `data`, `originalSize`, `compressedSize`, `ratio`) is the existing shape and is not modified.
- **Pitfall i (ArrayBuffer detach):** `bytes.slice()` is explicit at both pdfjs call sites in `PdfCompress.tsx` (Task 7.1) and noted in the helper docstring (Task 5.1).
- **UI stability contract:** preview frame has constant height/width across idle/processing/done; toggle slot reserves a 7-unit-tall row even when hidden; preset selection is via `nameplate[data-active]` box-shadow, not border-width.
- **Cross-cutting (convention 8):** no shared-hook changes (F5/F6/F7 stay in backlog), no `computeSavings` move, no `FileUpload` toast i18n changes.
