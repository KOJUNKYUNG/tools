# ppt-extract silver migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `/tools/ppt-extract` from the legacy basic shadcn layout to the silver design system, add per-image preview grid with individual + ZIP downloads, integrate into `Screen3Workspace` inline mount, and complete Phase 1.

**Architecture:** Two new pure helpers (`pptImageFormats`, `buildExtractZip`) drive a shape change in the extractors (`ExtractedImage[]` instead of `Uint8Array`). UI mirrors `pdf-to-image` (3-col grid + right action card) and `pdf-compress` (labels contract, `inline` mount, server page composition). No new shared assets; no handoff button; no scope creep.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19 client islands, TypeScript strict, Tailwind v4 utility CSS + globals.css tokens, vitest (node env), JSZip, `cfb` (legacy .ppt), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-05-27-ontab-phase-1-ppt-extract-design.md`

---

## Task 1: Branch setup

**Files:** none (git operation)

- [ ] **Step 1: Verify clean master, then ask user to confirm before creating branch**

User confirms before any branch creation (Convention 7 — branch creation isn't a hard stop, but the user is the one who triggers it per Convention 4 + ontab pattern). Show the planned branch name:

```
feat/ontab-phase-1-ppt-extract
```

Run (after user confirms):

```bash
git checkout -b feat/ontab-phase-1-ppt-extract
```

Expected: branch created, `git status` clean.

---

## Task 2: pptImageFormats helper (TDD)

**Files:**
- Create: `src/lib/ppt/pptImageFormats.ts`
- Test: `src/lib/ppt/pptImageFormats.test.ts`

Single source of truth for ext → mime mapping and renderability. Used by extractors (mime stamp) and UI cards (branch).

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/ppt/pptImageFormats.test.ts
import { describe, expect, it } from "vitest";
import { getExt, getMime, isRenderable } from "./pptImageFormats";

describe("pptImageFormats", () => {
  it("getExt extracts lowercase extension without dot", () => {
    expect(getExt("image_1.PNG")).toBe("png");
    expect(getExt("a.b.jpeg")).toBe("jpeg");
    expect(getExt("noext")).toBe("");
  });

  it("getMime maps known extensions", () => {
    expect(getMime("png")).toBe("image/png");
    expect(getMime("jpg")).toBe("image/jpeg");
    expect(getMime("jpeg")).toBe("image/jpeg");
    expect(getMime("gif")).toBe("image/gif");
    expect(getMime("bmp")).toBe("image/bmp");
    expect(getMime("tiff")).toBe("image/tiff");
    expect(getMime("tif")).toBe("image/tiff");
    expect(getMime("svg")).toBe("image/svg+xml");
    expect(getMime("emf")).toBe("application/octet-stream");
    expect(getMime("wmf")).toBe("application/octet-stream");
    expect(getMime("zzz")).toBe("application/octet-stream");
  });

  it("isRenderable returns true only for browser-displayable raster formats", () => {
    expect(isRenderable("png")).toBe(true);
    expect(isRenderable("jpg")).toBe(true);
    expect(isRenderable("jpeg")).toBe(true);
    expect(isRenderable("gif")).toBe(true);
    expect(isRenderable("bmp")).toBe(true);
    expect(isRenderable("tiff")).toBe(false);
    expect(isRenderable("svg")).toBe(false); // sandboxed but kept uniform with non-renderables
    expect(isRenderable("emf")).toBe(false);
    expect(isRenderable("wmf")).toBe(false);
    expect(isRenderable("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

```bash
pnpm test src/lib/ppt/pptImageFormats.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement helper**

```ts
// src/lib/ppt/pptImageFormats.ts
const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
  svg: "image/svg+xml",
};

const RENDERABLE = new Set(["png", "jpg", "jpeg", "gif", "bmp"]);

export function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot === -1 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function getMime(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] ?? "application/octet-stream";
}

export function isRenderable(ext: string): boolean {
  return RENDERABLE.has(ext.toLowerCase());
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
pnpm test src/lib/ppt/pptImageFormats.test.ts
```

Expected: PASS (3 specs).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ppt/pptImageFormats.ts src/lib/ppt/pptImageFormats.test.ts
git commit -m "feat(ppt-extract): add pptImageFormats helper (ext/mime/renderable)"
```

---

## Task 3: buildExtractZip helper (TDD)

**Files:**
- Create: `src/lib/ppt/buildExtractZip.ts`
- Test: `src/lib/ppt/buildExtractZip.test.ts`

Pure helper to package `ExtractedImage[]` into a ZIP at download time.

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/ppt/buildExtractZip.test.ts
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildExtractZip } from "./buildExtractZip";
import type { ExtractedImage } from "./extractImages";

function img(name: string, bytes: number[]): ExtractedImage {
  const data = new Uint8Array(bytes);
  return { name, data, mime: "application/octet-stream", size: data.length };
}

describe("buildExtractZip", () => {
  it("throws on empty input", async () => {
    await expect(buildExtractZip([])).rejects.toThrow();
  });

  it("packages images with their original names", async () => {
    const zipped = await buildExtractZip([
      img("a.png", [1, 2, 3]),
      img("b.jpg", [9, 8, 7, 6]),
    ]);
    // ZIP wraps bytes; re-open and check members.
    const zip = await JSZip.loadAsync(zipped);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(["a.png", "b.jpg"]);
    const aBytes = await zip.files["a.png"].async("uint8array");
    expect(Array.from(aBytes)).toEqual([1, 2, 3]);
  });

  it("preserves duplicate names by sequence suffix", async () => {
    const zipped = await buildExtractZip([
      img("dup.png", [1]),
      img("dup.png", [2]),
    ]);
    const zip = await JSZip.loadAsync(zipped);
    const names = Object.keys(zip.files).sort();
    // Implementation rewrites the 2nd duplicate to "dup (2).png"
    expect(names).toEqual(["dup (2).png", "dup.png"]);
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

```bash
pnpm test src/lib/ppt/buildExtractZip.test.ts
```

Expected: FAIL (module not found, plus `ExtractedImage` not yet defined — that's OK, Task 4/5 will define it; for this task we define it locally in step 3 to keep the test green, then re-import in later tasks).

- [ ] **Step 3: Define `ExtractedImage` in `extractImages.ts` (forward-declaration shim) and implement buildExtractZip**

Add the type to `src/lib/ppt/extractImages.ts` (don't change behavior yet — that's Task 5):

```ts
// at the top of src/lib/ppt/extractImages.ts, ADD this export. Leave existing code intact.
export interface ExtractedImage {
  name: string;
  data: Uint8Array;
  mime: string;
  size: number;
}
```

Create the helper:

```ts
// src/lib/ppt/buildExtractZip.ts
import JSZip from "jszip";
import type { ExtractedImage } from "./extractImages";

export async function buildExtractZip(images: ExtractedImage[]): Promise<Uint8Array> {
  if (images.length === 0) {
    throw new Error("No images to package.");
  }
  const zip = new JSZip();
  const used = new Set<string>();
  for (const img of images) {
    let name = img.name;
    if (used.has(name)) {
      const dot = name.lastIndexOf(".");
      const stem = dot === -1 ? name : name.slice(0, dot);
      const ext = dot === -1 ? "" : name.slice(dot);
      let n = 2;
      while (used.has(`${stem} (${n})${ext}`)) n++;
      name = `${stem} (${n})${ext}`;
    }
    used.add(name);
    zip.file(name, img.data);
  }
  return zip.generateAsync({ type: "uint8array" });
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
pnpm test src/lib/ppt/buildExtractZip.test.ts
```

Expected: PASS (3 specs).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ppt/buildExtractZip.ts src/lib/ppt/buildExtractZip.test.ts src/lib/ppt/extractImages.ts
git commit -m "feat(ppt-extract): add buildExtractZip helper + ExtractedImage type"
```

---

## Task 4: Refactor `extractImagesFromPpt.ts` to return `ExtractedImage[]`

**Files:**
- Modify: `src/lib/ppt/extractImagesFromPpt.ts`

Change return shape; remove JSZip dependency from this file (zip composition moves to caller / `buildExtractZip`). Reuse `getMime`.

- [ ] **Step 1: Rewrite the file**

```ts
// src/lib/ppt/extractImagesFromPpt.ts
import CFB from "cfb";
import type { ExtractedImage } from "./extractImages";
import { getMime } from "./pptImageFormats";

export interface ExtractPptOptions {
  file: File;
  onProgress?: (pct: number) => void;
}

interface BlipInfo {
  ext: string;
  headerSize: number;
}

const BLIP_META: Record<number, BlipInfo> = {
  0xf01a: { ext: "emf", headerSize: 50 },
  0xf01b: { ext: "wmf", headerSize: 50 },
  0xf01d: { ext: "jpg", headerSize: 17 },
  0xf01e: { ext: "png", headerSize: 17 },
  0xf01f: { ext: "bmp", headerSize: 17 },
  0xf029: { ext: "tiff", headerSize: 17 },
};

const MAGIC_BYTES: Record<string, number[]> = {
  jpg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
  bmp: [0x42, 0x4d],
  emf: [0x01, 0x00, 0x00, 0x00],
  tiff_le: [0x49, 0x49, 0x2a, 0x00],
  tiff_be: [0x4d, 0x4d, 0x00, 0x2a],
};

function matchesMagic(data: Uint8Array, offset: number, magic: number[]): boolean {
  if (offset + magic.length > data.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (data[offset + i] !== magic[i]) return false;
  }
  return true;
}

function findImageStart(data: Uint8Array, offset: number, ext: string): number {
  const searchEnd = Math.min(offset + 100, data.length);
  if (ext === "tiff") {
    for (let i = offset; i < searchEnd; i++) {
      if (matchesMagic(data, i, MAGIC_BYTES.tiff_le) || matchesMagic(data, i, MAGIC_BYTES.tiff_be)) {
        return i;
      }
    }
    return -1;
  }
  const magic = MAGIC_BYTES[ext];
  if (!magic) return -1;
  for (let i = offset; i < searchEnd; i++) {
    if (matchesMagic(data, i, magic)) return i;
  }
  return -1;
}

function parseBlipRecords(picturesData: Uint8Array): ExtractedImage[] {
  const images: ExtractedImage[] = [];
  let offset = 0;
  const counters: Record<string, number> = {};

  while (offset + 8 <= picturesData.length) {
    const recVerInstance =
      picturesData[offset] | (picturesData[offset + 1] << 8);
    const recType =
      picturesData[offset + 2] | (picturesData[offset + 3] << 8);
    const recLen =
      picturesData[offset + 4] |
      (picturesData[offset + 5] << 8) |
      (picturesData[offset + 6] << 16) |
      (picturesData[offset + 7] << 24);

    if (recLen <= 0 || offset + 8 + recLen > picturesData.length) break;

    const blipInfo = BLIP_META[recType];
    if (blipInfo) {
      const dataStart = offset + 8;
      const dataEnd = offset + 8 + recLen;
      const imgStart = findImageStart(picturesData, dataStart, blipInfo.ext);
      if (imgStart >= 0 && imgStart < dataEnd) {
        const imgData = picturesData.slice(imgStart, dataEnd);
        const count = (counters[blipInfo.ext] = (counters[blipInfo.ext] ?? 0) + 1);
        const name = `image_${count}.${blipInfo.ext}`;
        images.push({
          name,
          data: imgData,
          mime: getMime(blipInfo.ext),
          size: imgData.length,
        });
      }
    } else if ((recVerInstance & 0x0f) === 0x0f) {
      const containerEnd = offset + 8 + recLen;
      const innerImages = parseBlipRecords(
        picturesData.slice(offset + 8, containerEnd),
      );
      images.push(...innerImages);
    }

    offset += 8 + recLen;
  }

  return images;
}

export async function extractImagesFromPpt({
  file,
  onProgress,
}: ExtractPptOptions): Promise<ExtractedImage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const cfb = CFB.read(new Uint8Array(arrayBuffer), { type: "array" });

  let picturesData: Uint8Array | null = null;
  for (const entry of cfb.FileIndex) {
    if (entry.name === "Pictures" && entry.content) {
      const raw = entry.content;
      picturesData = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      break;
    }
  }

  if (!picturesData || picturesData.length === 0) {
    throw new Error("NO_IMAGES");
  }

  onProgress?.(30);
  const images = parseBlipRecords(picturesData);
  if (images.length === 0) {
    throw new Error("NO_IMAGES");
  }
  onProgress?.(100);
  return images;
}
```

Note: error string changed to `"NO_IMAGES"` so the page layer can map to localised copy via `errorOptions`/labels (the previous Korean hardcoded string was a leak).

- [ ] **Step 2: Confirm type-check still passes (the callsite in `extractImages.ts` will be updated in Task 5; tsc may fail momentarily on the import — that is fine, do not commit until Task 5)**

```bash
pnpm exec tsc --noEmit
```

Expected: at most errors in `extractImages.ts` referencing the old shape. Note them and proceed.

- [ ] **Step 3: Do not commit yet — Task 5 finishes the refactor and they commit together**

---

## Task 5: Refactor `extractImages.ts` to return `ExtractedImage[]`

**Files:**
- Modify: `src/lib/ppt/extractImages.ts`

Rewrite the .pptx branch to return `ExtractedImage[]`, drop the JSZip output composition (now in `buildExtractZip`).

- [ ] **Step 1: Rewrite the file**

```ts
// src/lib/ppt/extractImages.ts
import JSZip from "jszip";
import { extractImagesFromPpt } from "./extractImagesFromPpt";
import { getExt, getMime, isRenderable } from "./pptImageFormats";

export interface ExtractedImage {
  name: string;
  data: Uint8Array;
  mime: string;
  size: number;
}

export interface ExtractImagesOptions {
  file: File;
  onProgress?: (pct: number) => void;
}

const SUPPORTED_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp",
  "tiff", "tif", "svg", "emf", "wmf",
]);

function isImageFile(name: string): boolean {
  return SUPPORTED_EXTENSIONS.has(getExt(name));
}

function isPptFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".ppt");
}

async function extractFromPptx(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<ExtractedImage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const mediaEntries: { name: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((path, entry) => {
    if (path.startsWith("ppt/media/") && !entry.dir && isImageFile(path)) {
      mediaEntries.push({ name: path.split("/").pop()!, entry });
    }
  });

  if (mediaEntries.length === 0) {
    throw new Error("NO_IMAGES");
  }

  const images: ExtractedImage[] = [];
  for (let i = 0; i < mediaEntries.length; i++) {
    const data = await mediaEntries[i].entry.async("uint8array");
    const name = mediaEntries[i].name;
    images.push({
      name,
      data,
      mime: getMime(getExt(name)),
      size: data.length,
    });
    onProgress?.(Math.round(((i + 1) / mediaEntries.length) * 100));
  }
  return images;
}

export async function extractPptImages({
  file,
  onProgress,
}: ExtractImagesOptions): Promise<ExtractedImage[]> {
  if (isPptFile(file)) {
    return extractImagesFromPpt({ file, onProgress });
  }
  return extractFromPptx(file, onProgress);
}

// Re-export for downstream convenience.
export { isRenderable, getExt, getMime };
```

- [ ] **Step 2: Run type check + existing tests**

```bash
pnpm exec tsc --noEmit
pnpm test
```

Expected: tsc clean; all tests pass (helpers from Task 2/3, plus untouched existing suites).

- [ ] **Step 3: Commit**

```bash
git add src/lib/ppt/extractImages.ts src/lib/ppt/extractImagesFromPpt.ts
git commit -m "refactor(ppt-extract): return ExtractedImage[] (ZIP moves to download time)"
```

---

## Task 6: i18n keys (KO + EN)

**Files:**
- Modify: `src/i18n/dictionaries/ko.json`
- Modify: `src/i18n/dictionaries/en.json`

Expand the `ppt-extract` entry from `{title, description}` to include the full `page` object. Keep existing `title`/`description` strings unchanged (the cross-cutting copy audit is in the polish backlog).

- [ ] **Step 1: Edit `ko.json` — replace the `"ppt-extract"` line**

Locate the existing line (currently around line 165):

```json
"ppt-extract": { "title": "PPT 이미지 추출", "description": "프레젠테이션에 포함된 모든 이미지를 꺼내옵니다." },
```

Replace with:

```json
"ppt-extract": {
  "title": "PPT 이미지 추출",
  "description": "프레젠테이션에 포함된 모든 이미지를 꺼내옵니다.",
  "page": {
    "uploadPrompt": "PPT/PPTX 파일을 드래그하거나 클릭하여 업로드",
    "uploadHint": ".ppt 및 .pptx 형식을 지원합니다.",
    "uploadMaxSize": "파일당 최대 {size}",
    "reupload": "다시 업로드",
    "reset": "다시 시작",
    "fileInfo": "{name} · {size}",
    "extract": "이미지 추출",
    "processing": "추출 중…",
    "resultTitle": "추출 결과",
    "imageCount": "{n}장",
    "totalSizeLabel": "총 크기",
    "downloadZip": "ZIP 다운로드",
    "downloadOneAria": "{name} 다운로드",
    "again": "다시 작업",
    "placeholderLabel": "미리보기 불가",
    "errorNoImages": "PPT 파일에서 이미지를 찾을 수 없습니다."
  }
},
```

- [ ] **Step 2: Edit `en.json` — replace the `"ppt-extract"` line**

Locate the existing line (currently around line 165):

```json
"ppt-extract": { "title": "Extract PPT images", "description": "Pull every embedded image out of a .pptx file." },
```

Replace with:

```json
"ppt-extract": {
  "title": "Extract PPT images",
  "description": "Pull every embedded image out of a .pptx file.",
  "page": {
    "uploadPrompt": "Drag and drop a PPT/PPTX, or click to upload",
    "uploadHint": "Supports .ppt and .pptx.",
    "uploadMaxSize": "Up to {size} per file",
    "reupload": "Re-upload",
    "reset": "Start over",
    "fileInfo": "{name} · {size}",
    "extract": "Extract images",
    "processing": "Extracting…",
    "resultTitle": "Extracted images",
    "imageCount": "{n} images",
    "totalSizeLabel": "Total size",
    "downloadZip": "Download ZIP",
    "downloadOneAria": "Download {name}",
    "again": "Start over",
    "placeholderLabel": "Preview unavailable",
    "errorNoImages": "No images found in this presentation."
  }
},
```

- [ ] **Step 3: Type check**

```bash
pnpm exec tsc --noEmit
```

Expected: clean (Dictionary type is structural — new keys are simply available; callsites will pick them up in subsequent tasks).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/dictionaries/ko.json src/i18n/dictionaries/en.json
git commit -m "i18n(ppt-extract): add page label keys for silver migration"
```

---

## Task 7: `labels.ts` (component-side label mapping)

**Files:**
- Create: `src/components/tools/ppt-extract/labels.ts`

Mirrors `pdf-compress/labels.ts` structure.

- [ ] **Step 1: Create the file**

```ts
// src/components/tools/ppt-extract/labels.ts
import type { Dictionary } from "@/i18n/config";

export interface PptExtractLabels {
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
  // Action
  extract: string;
  processing: string;
  // Result
  resultTitle: string;
  imageCountTemplate: string;
  totalSizeLabel: string;
  downloadZip: string;
  downloadOneAria: string;
  again: string;
  placeholderLabel: string;
  // Errors
  errorNoImages: string;
}

export function getPptExtractLabels(dict: Dictionary): PptExtractLabels {
  const t = dict.tools["ppt-extract"];
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
    extract: p.extract,
    processing: p.processing,
    resultTitle: p.resultTitle,
    imageCountTemplate: p.imageCount,
    totalSizeLabel: p.totalSizeLabel,
    downloadZip: p.downloadZip,
    downloadOneAria: p.downloadOneAria,
    again: p.again,
    placeholderLabel: p.placeholderLabel,
    errorNoImages: p.errorNoImages,
  };
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/ppt-extract/labels.ts
git commit -m "feat(ppt-extract): add labels mapping"
```

---

## Task 8: `ExtractedImageCard.tsx`

**Files:**
- Create: `src/components/tools/ppt-extract/ExtractedImageCard.tsx`

Per-image cell. Tokens mirror `pdf-to-image/PdfToImageResult.tsx ResultCell`. Renderable vs placeholder branch is the only divergence.

- [ ] **Step 1: Create the file**

```tsx
// src/components/tools/ppt-extract/ExtractedImageCard.tsx
"use client";

import { DownloadIcon, FileImageIcon } from "lucide-react";
import { formatBytes } from "@/lib/common/formatBytes";
import { getExt } from "@/lib/ppt/pptImageFormats";

interface ExtractedImageCardProps {
  url: string | null;        // null when not renderable
  name: string;
  size: number;
  index: number;             // 1-based (trap h)
  placeholderLabel: string;
  onDownload: () => void;
  downloadAria: string;
}

export function ExtractedImageCard({
  url,
  name,
  size,
  index,
  placeholderLabel,
  onDownload,
  downloadAria,
}: ExtractedImageCardProps) {
  const ext = getExt(name).toUpperCase();
  return (
    <div
      className="group relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[5px]"
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
      ) : (
        <div className="flex flex-col items-center justify-center gap-1.5 px-2 text-center">
          <FileImageIcon className="size-7" style={{ color: "var(--silver-500)" }} />
          <span
            className="font-display text-[10px] font-semibold tracking-wider"
            style={{ color: "var(--silver-700)" }}
          >
            {ext || "FILE"}
          </span>
          <span
            className="font-body text-[9.5px] leading-tight"
            style={{ color: "var(--silver-600)" }}
          >
            {placeholderLabel}
          </span>
        </div>
      )}

      {/* Number badge (top-left, hover-only) — fixed color (trap j) */}
      <span
        className="pointer-events-none absolute left-1.5 top-1.5 rounded-md px-[7px] py-px text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: "rgba(20,30,60,0.85)" }}
      >
        {index}
      </span>

      {/* Per-image download (top-right, hover-only) */}
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

      {/* Filename + bytes (bottom, hover-only) */}
      <div
        className="pointer-events-none absolute inset-x-2 bottom-1.5 truncate rounded-md border bg-white/95 px-1 py-0.5 text-center text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
        style={{ borderColor: "var(--silver-200)", color: "var(--silver-700)" }}
      >
        {name} · {formatBytes(size)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/ppt-extract/ExtractedImageCard.tsx
git commit -m "feat(ppt-extract): add ExtractedImageCard (silver tokens, renderable+placeholder)"
```

---

## Task 9: `PptExtractResult.tsx`

**Files:**
- Create: `src/components/tools/ppt-extract/PptExtractResult.tsx`

Two-column layout. Left = 3-col grid; right = action card. Object URL lifecycle via `useEffect`.

- [ ] **Step 1: Create the file**

```tsx
// src/components/tools/ppt-extract/PptExtractResult.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { DownloadIcon, RotateCcwIcon } from "lucide-react";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import type { ExtractedImage } from "@/lib/ppt/extractImages";
import { getExt, isRenderable } from "@/lib/ppt/pptImageFormats";
import { ExtractedImageCard } from "./ExtractedImageCard";
import type { PptExtractLabels } from "./labels";

interface PptExtractResultProps {
  images: ExtractedImage[];
  labels: PptExtractLabels;
  onDownloadAll: () => void;
  onDownloadOne: (image: ExtractedImage) => void;
  onAgain: () => void;
}

export function PptExtractResult({
  images,
  labels,
  onDownloadAll,
  onDownloadOne,
  onAgain,
}: PptExtractResultProps) {
  // StrictMode-safe object URL batch — re-keyed on `images`.
  const [urls, setUrls] = useState<(string | null)[]>([]);
  useEffect(() => {
    const next: (string | null)[] = images.map((img) => {
      if (!isRenderable(getExt(img.name))) return null;
      return URL.createObjectURL(new Blob([img.data], { type: img.mime }));
    });
    setUrls(next);
    return () => {
      for (const u of next) if (u) URL.revokeObjectURL(u);
    };
  }, [images]);

  const totalSize = useMemo(
    () => images.reduce((sum, img) => sum + img.size, 0),
    [images],
  );

  // Format breakdown chip — e.g. "PNG 12 · JPG 3 · EMF 2".
  const breakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const img of images) {
      const ext = (getExt(img.name) || "?").toUpperCase();
      counts.set(ext, (counts.get(ext) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([ext, n]) => `${ext} ${n}`)
      .join(" · ");
  }, [images]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2" style={{ height: "52vh" }}>
      <div className="ob-scroll min-h-0 overflow-y-auto pr-1">
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, i) => (
            <ExtractedImageCard
              key={`${img.name}-${i}`}
              url={urls[i] ?? null}
              name={img.name}
              size={img.size}
              index={i + 1}
              placeholderLabel={labels.placeholderLabel}
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
        {breakdown && (
          <div className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
            {breakdown}
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onDownloadAll}
            className="btn-download glint inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-4 font-display text-[12px] font-medium"
          >
            <DownloadIcon className="size-3.5" />
            {labels.downloadZip}
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

- [ ] **Step 2: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/ppt-extract/PptExtractResult.tsx
git commit -m "feat(ppt-extract): add PptExtractResult (grid + action card)"
```

---

## Task 10: `PptExtract.tsx` (main component)

**Files:**
- Create: `src/components/tools/ppt-extract/PptExtract.tsx`

Main island. Mirrors pdf-compress structure (header chrome conditional on `inline`, `useToolProcessor`, hidden reupload input, error mapping).

- [ ] **Step 1: Create the file**

```tsx
// src/components/tools/ppt-extract/PptExtract.tsx
"use client";

import { useCallback, useEffect, useRef } from "react";
import { ImageDownIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { downloadBlobObject } from "@/lib/pdf/downloadBlob";
import { buildExtractZip } from "@/lib/ppt/buildExtractZip";
import {
  extractPptImages,
  type ExtractedImage,
} from "@/lib/ppt/extractImages";
import { PptExtractResult } from "./PptExtractResult";
import type { PptExtractLabels } from "./labels";

const PPTX_ACCEPT = {
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
  "application/vnd.ms-powerpoint": [".ppt"],
};

interface PptExtractProps {
  labels: PptExtractLabels;
  inline?: boolean;
}

function baseName(name: string): string {
  return name.replace(/\.pptx?$/i, "") || "ppt";
}

export function PptExtract({ labels, inline = false }: PptExtractProps) {
  const reuploadInputRef = useRef<HTMLInputElement | null>(null);
  const filesRef = useRef<File[]>([]);

  const {
    files,
    setFiles,
    status,
    progress,
    errorMessage,
    result,
    run,
    retry,
  } = useToolProcessor<ExtractedImage[]>({
    processor: (processorFiles, onProgress) =>
      extractPptImages({ file: processorFiles[0], onProgress }),
    onDownload: () => {
      // Not used directly — the result component drives downloads.
    },
    errorOptions: {
      // Map the extractor's NO_IMAGES sentinel to a localised string.
      // (getErrorMessage falls through to err.message otherwise.)
    },
  });

  useEffect(() => {
    filesRef.current = files;
  });

  const file = files[0];
  const hasFile = !!file;
  const busy = status === "processing";
  const isDone = status === "done" && !!result;

  const fileInfo = file
    ? template(labels.fileInfoTemplate, {
        name: file.name,
        size: formatBytes(file.size),
      })
    : "";

  const handleFilesChange = useCallback(
    (newFiles: File[]) => {
      retry();
      setFiles(newFiles.slice(0, 1));
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

  const onReset = useCallback(() => handleFilesChange([]), [handleFilesChange]);

  const handleExtract = useCallback(() => {
    if (!file) {
      toast.error(labels.uploadPrompt);
      return;
    }
    run();
  }, [file, run, labels.uploadPrompt]);

  const handleAgain = useCallback(() => {
    retry();
  }, [retry]);

  const handleDownloadAll = useCallback(async () => {
    if (!result) return;
    const zip = await buildExtractZip(result);
    const blob = new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" });
    downloadBlobObject(blob, `${baseName(filesRef.current[0]?.name ?? "ppt")}-images.zip`);
  }, [result]);

  const handleDownloadOne = useCallback((image: ExtractedImage) => {
    const blob = new Blob([image.data.buffer as ArrayBuffer], { type: image.mime });
    downloadBlobObject(blob, image.name);
  }, []);

  // Localise the NO_IMAGES sentinel from the extractors.
  const displayError =
    errorMessage === "NO_IMAGES" ? labels.errorNoImages : errorMessage;

  const body = (
    <div className={inline ? "space-y-4" : "space-y-4 px-6 py-3"}>
      <input
        ref={reuploadInputRef}
        type="file"
        accept=".ppt,.pptx"
        onChange={handleHiddenInputChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {!hasFile ? (
        <FileUpload
          accept={PPTX_ACCEPT}
          multiple={false}
          hideFileList
          onFiles={handleFilesChange}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={{ maxSize: labels.uploadMaxSize }}
        />
      ) : isDone && result ? (
        <PptExtractResult
          images={result}
          labels={labels}
          onDownloadAll={handleDownloadAll}
          onDownloadOne={handleDownloadOne}
          onAgain={onReset}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div
              className="min-w-0 truncate font-body text-[12px]"
              style={{ color: "var(--ink)" }}
              title={fileInfo}
            >
              {fileInfo}
            </div>
            <button
              type="button"
              onClick={handleReupload}
              disabled={busy}
              className="shrink-0 rounded-[5px] border px-2.5 py-1 font-display text-[11px] transition-colors hover:border-[color:var(--accent-electric)] disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border)",
                color: "var(--ink-strong)",
              }}
            >
              {labels.reupload}
            </button>
          </div>

          {status === "idle" && (
            <button
              type="button"
              onClick={handleExtract}
              className="btn-primary glint inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[9px] px-4 font-display text-[13px] font-semibold"
            >
              {labels.extract}
            </button>
          )}

          <ProcessingStatus
            status={status}
            progress={progress}
            errorMessage={displayError}
            onRetry={handleAgain}
            labels={{ processing: labels.processing }}
          />
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
          <ImageDownIcon size={18} />
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

- [ ] **Step 2: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/ppt-extract/PptExtract.tsx
git commit -m "feat(ppt-extract): add main PptExtract island (silver chrome + inline mount)"
```

---

## Task 11: Server page rewrite

**Files:**
- Modify (full rewrite): `src/app/[lang]/(chrome)/tools/ppt-extract/page.tsx`

Mirrors `pdf-compress/page.tsx`: server component, dict load, single child render. The legacy client implementation is fully replaced.

- [ ] **Step 1: Overwrite the file**

```tsx
// src/app/[lang]/(chrome)/tools/ppt-extract/page.tsx
import { getDictionary, type Locale } from "@/i18n/config";
import { locales } from "@/i18n/locales";
import { PptExtract } from "@/components/tools/ppt-extract/PptExtract";
import { getPptExtractLabels } from "@/components/tools/ppt-extract/labels";

interface PageProps {
  params: Promise<{ lang: string }>;
}

function asLocale(lang: string): Locale {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : "ko";
}

export default async function PptExtractPage({ params }: PageProps) {
  const { lang } = await params;
  const dict = await getDictionary(asLocale(lang));
  const labels = getPptExtractLabels(dict);

  return (
    <div
      className="mx-auto px-4 py-8"
      style={{
        width: "min(var(--tweak-workspace-width, 980px), calc(100vw - 32px))",
      }}
    >
      <PptExtract labels={labels} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check + build**

```bash
pnpm exec tsc --noEmit
pnpm build
```

Expected: both clean (the old `useToolProcessor<Uint8Array>` callsite no longer exists; build emits the new page).

- [ ] **Step 3: Commit**

```bash
git add src/app/[lang]/\(chrome\)/tools/ppt-extract/page.tsx
git commit -m "feat(ppt-extract): replace legacy page with server-rendered silver chrome"
```

---

## Task 12: Screen3Workspace inline mount

**Files:**
- Modify: `src/components/landing/Screen3Workspace.tsx`

Add `case "ppt-extract"` to the existing `switch` in `renderToolBody()`.

- [ ] **Step 1: Add imports near the other tool imports (alphabetical-by-import-style, after pdf-compress)**

```tsx
import { PptExtract } from "@/components/tools/ppt-extract/PptExtract";
import { getPptExtractLabels } from "@/components/tools/ppt-extract/labels";
```

- [ ] **Step 2: Add case branch inside `renderToolBody()` (after the `pdf-compress` case, before the `pdf-arrange` group)**

```tsx
case "ppt-extract":
  return <PptExtract inline labels={getPptExtractLabels(dict)} />;
```

- [ ] **Step 3: Type-check + build**

```bash
pnpm exec tsc --noEmit
pnpm build
```

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/Screen3Workspace.tsx
git commit -m "feat(ppt-extract): mount inline inside Screen3 (bridge replaced)"
```

---

## Task 12.5: Idle preview (added 2026-05-28)

Added in response to user feedback. See spec §"Idle preview". Three sub-deliverables:

**Files:**
- Create: `src/lib/ppt/analyzePresentation.ts`
- Create: `src/lib/ppt/analyzePresentation.test.ts`
- Create: `src/components/tools/ppt-extract/PptExtractPreview.tsx`
- Modify: `src/components/tools/ppt-extract/PptExtract.tsx` (idle layout → 2-col)
- Modify: `src/i18n/dictionaries/ko.json` + `en.json` (3 new keys)
- Modify: `src/components/tools/ppt-extract/labels.ts` (3 new fields)

Spec details and i18n key list live in the spec doc. Implementation is dispatched as one or two subagent tasks (helper TDD first, then UI integration), not pre-written here to keep the plan readable.

---

## Task 13: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full test + tsc + build**

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

Expected: all green. New tests = 6 specs across `pptImageFormats` (3) + `buildExtractZip` (3). Existing suites unchanged.

- [ ] **Step 2: Quick repo health check — no orphan imports / dead files**

```bash
git ls-files src/lib/ppt src/components/tools/ppt-extract
```

Expected output (10 files):

```
src/components/tools/ppt-extract/ExtractedImageCard.tsx
src/components/tools/ppt-extract/PptExtract.tsx
src/components/tools/ppt-extract/PptExtractResult.tsx
src/components/tools/ppt-extract/labels.ts
src/lib/ppt/buildExtractZip.test.ts
src/lib/ppt/buildExtractZip.ts
src/lib/ppt/changeBackground.ts
src/lib/ppt/extractCurrentBackgrounds.ts
src/lib/ppt/extractImages.ts
src/lib/ppt/extractImagesFromPpt.ts
src/lib/ppt/pptImageFormats.test.ts
src/lib/ppt/pptImageFormats.ts
```

Confirm no `src/components/tools/ppt-extract/` files are unreferenced (each is imported by another in the tree).

- [ ] **Step 3: Stop — hand off to user for visual verification**

This is a task-boundary. Report Done/Why/Next per convention and wait. User runs `pnpm dev` and confirms:

- Page route `/ko/tools/ppt-extract` + `/en/tools/ppt-extract` renders the silver chrome.
- A `.pptx` with mixed PNG/JPG produces a 3-col grid; per-image download works; ZIP download names file as `{base}-images.zip`.
- A `.ppt` (legacy CFB) extracts successfully through the same UI.
- A `.pptx` containing EMF/WMF shows placeholder cards (file icon + EMF/WMF badge), but ZIP includes those files.
- Reset returns to upload state, no leaked URLs (DevTools → Memory → object URLs).
- Inline mount via Screen3 → ppt-extract card opens the same UI inside the workspace.
- KO and EN copy both display correctly.

---

## Task 14: /review then /ship

**Files:** none (workflow)

- [ ] **Step 1: Run `/review` (gstack)**

Per CLAUDE.md "Shipping gate" — substantive change must go through `/review` → `/ship`.

- [ ] **Step 2: After review fixes are committed, run `/ship` (gstack)**

Skip VERSION bump + CHANGELOG (project convention, see PR #14 etc.). Squash-merge target.

- [ ] **Step 3: After merge, post-merge memory updates (separate from this branch)**

Update `ontab_phase_progress.md`: mark ppt-extract complete, mark Phase 1 done (or note remaining cross-cutting polish PR).

---

## Self-Review

**Spec coverage:**
- File layout (spec §Architecture/File layout) → Tasks 2, 3, 7, 8, 9, 10, 11, 12 ✓
- `ExtractedImage` type + signature change → Tasks 3 (forward decl), 4, 5 ✓
- Format table → Task 2 (`pptImageFormats`) ✓
- UI composition (PptExtract.tsx) → Task 10 ✓
- UI composition (PptExtractResult.tsx) → Task 9 ✓
- ExtractedImageCard with placeholder branch → Task 8 ✓
- Object URL lifecycle (StrictMode-safe) → Task 9 step 1 (useEffect with cleanup) ✓
- Screen3 integration → Task 12 ✓
- i18n keys → Task 6 ✓
- Unit tests (`pptImageFormats`, `buildExtractZip`) → Tasks 2, 3 ✓
- Static verification (tsc/build/test) → Task 13 ✓
- User visual verification list → Task 13 step 3 ✓
- Conventions cross-check → Task 1 (branch), Task 14 (ship gate) ✓
- Trap h (1-based) → Task 8 prop docs + index `i + 1` in Task 9 ✓
- Trap j (fixed on-paper colors) → Task 8 (`rgba(20,30,60,0.85)` badge, `--silver-*` placeholder) ✓

**Placeholder scan:** No TBDs, no "implement later", no "similar to Task N". All code blocks complete.

**Type consistency:**
- `ExtractedImage { name, data, mime, size }` defined in Task 3 (forward decl in `extractImages.ts`) and Task 5 (final), consumed in Tasks 4, 5, 8, 9, 10. All four fields match across uses. ✓
- `PptExtractLabels` defined in Task 7, consumed in Tasks 8 (via `placeholderLabel`/`downloadOneAria` props), 9, 10. All referenced keys (`uploadPrompt`, `uploadHint`, `uploadMaxSize`, `reupload`, `reset`, `fileInfoTemplate`, `extract`, `processing`, `resultTitle`, `imageCountTemplate`, `totalSizeLabel`, `downloadZip`, `downloadOneAria`, `again`, `placeholderLabel`, `errorNoImages`, `title`, `description`) exist in the interface. ✓
- `buildExtractZip(images): Promise<Uint8Array>` signature: defined in Task 3, called in Task 10 (`handleDownloadAll`). ✓
- `extractPptImages` returns `Promise<ExtractedImage[]>`: changed in Task 5, consumed in Task 10 (`useToolProcessor<ExtractedImage[]>`). ✓
- `getMime`, `isRenderable`, `getExt`: defined in Task 2, re-exported from `extractImages.ts` in Task 5, consumed in Tasks 4, 8, 9. ✓
- `downloadBlobObject(blob, filename)`: existing util at `src/lib/pdf/downloadBlob.ts` (already in repo), called in Task 10. ✓
- Error sentinel `"NO_IMAGES"`: thrown in Tasks 4, 5; mapped to `labels.errorNoImages` in Task 10 (`displayError`). ✓

No gaps found.
