# PPT 용량 줄이기 (ppt-compress) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PPTX(=ZIP) 안의 `ppt/media/*` 이미지를 브라우저에서 다시 압축해 파일 크기를 줄이는 신규 도구 `/tools/ppt-compress`를 추가한다.

**Architecture:** jszip로 PPTX를 풀고 → JPEG/PNG media를 browser-image-compression으로 **같은 포맷 그대로** 재인코딩(결과가 원본보다 크면 스킵) → 재패키징. media 파일명·rels·Content_Types는 전혀 건드리지 않아 PowerPoint 열림을 보장하고, 재패키징 후 entry 집합·슬라이드 수 불변을 무결성 가드로 검증한다. UI는 pdf-compress와 동일한 2열 52vh 레이아웃(프리셋 토글 + 파생 예상 + 전후 결과)이되, 미리보기는 PPTX 내장 `docProps/thumbnail`을 정적으로 보여준다.

**Tech Stack:** Next.js(App Router) · TypeScript strict · jszip(설치됨) · browser-image-compression(설치됨) · Vitest · 신규 의존성 0.

**Locked decisions (from /plan-eng-review 2026-05-31):**
1. 구조: pdf-compress 형제와 동일한 per-tool 파일 구조. 순수 로직 / 브라우저 리컴프레스 분리.
2. 이미지 전략: **in-place 동일포맷 재인코딩** — JPEG→JPEG(프리셋 품질), PNG→PNG(투명 보존, 무손실 재인코딩). 결과>원본이면 entry 스킵. media 파일명/rels/Content_Types 불변 → PNG→JPEG 전환은 하지 않음(투명도 위험 0, PowerPoint 열림 보장).
3. 품질 컨트롤: low/medium/high 프리셋(pdf-compress 동일).
4. 예상/미리보기: recompressible media 바이트 비율 기반 **파생 추정** + `docProps/thumbnail` 정적 썸네일.
5. .ppt 처리: .pptx 전용. 레거시 .ppt는 FileUpload accept에서 자동 거부(invalid-type 토스트).
6. 용량 한도: **이 도구만 50MB**(`FILE_SIZE_LIMIT.user`를 FileUpload `maxSize` prop로 전달). 전역 한도 상향+OOM 방지는 폴리싱 단계로 분리.

---

## File Structure

**Pure logic (node vitest, 100% branch coverage):**
- `src/lib/ppt/pptCompressPlan.ts` — media 분류, smaller 선택, 출력 파일명, 예상 크기 계산.
- `src/lib/ppt/pptCompressIntegrity.ts` — 재패키징 후 무결성 단언(`CORRUPT_OUTPUT:` throw).

**Browser orchestration (tsc/build + 사용자 시각 /qa):**
- `src/lib/ppt/compressPptx.ts` — `analyzePptxForCompress`(썸네일·바이트 분석), `compressPptx`(언팩→재인코딩→재패키징→무결성).

**UI (사용자 시각 /qa):**
- `src/components/tools/ppt-compress/labels.ts`
- `src/components/tools/ppt-compress/PptCompressControls.tsx`
- `src/components/tools/ppt-compress/PptCompressEstimate.tsx`
- `src/components/tools/ppt-compress/PptCompressResult.tsx`
- `src/components/tools/ppt-compress/PptCompressPreview.tsx`
- `src/components/tools/ppt-compress/PptCompress.tsx`
- `src/app/[lang]/(chrome)/tools/ppt-compress/page.tsx`

**Registry + i18n:**
- `src/lib/constants.ts` — TOOLS 엔트리 + `Minimize2` 아이콘 import.
- `src/i18n/dictionaries/ko.json` · `en.json` — `tools["ppt-compress"]` 블록.

**Reused as-is (복사 금지):** `aggregateFormats`·`pickThumbnailPath`(analyzePresentation.ts에서 export됨), `getExt`·`getMime`·`formatBreakdownString`(pptImageFormats.ts), `useToolProcessor`, `formatBytes`, `template`, `computeSavings`, `downloadBlob`, `FileUpload`(`maxSize` prop 지원), `ProcessingStatus`, `getErrorMessage`(`CORRUPT_OUTPUT:` 프리픽스 처리).

### Data flow

```
upload .pptx (≤50MB)
   │
   ├─ analyzePptxForCompress(file)          [idle, 1회/파일]
   │     unzip → docProps/thumbnail (정적 미리보기)
   │           → recompressibleBytes 합산 (jpg/jpeg/png)
   │           → imageCount / formatCounts (breakdown)
   │
   ├─ PptCompressEstimate(preset, originalSize, recompressibleBytes)
   │     mediaShare = recompressibleBytes / originalSize
   │     share ≥ cutoff → 파생 예상 크기, else "원본과 유사"
   │
   └─ [압축] run → compressPptx({file, preset})
         unzip → ppt/media/*.{jpg,jpeg,png} 1개씩:
            bytes = entry.async
            action = classifyMedia(ext, preset)   (jpeg|png|passthrough)
            candidate = browser-image-compression(bytes, action)   (실패 시 null)
            chosen = pickSmaller(bytes, candidate)
            usedCandidate → zip.file(path, chosen, {compression:"STORE"})
         generateAsync(DEFLATE)  →  output bytes
         re-open output → assertPptxIntegrity(entry집합·슬라이드수·size)
         return {data, originalSize, compressedSize, ratio}
         │
         └─ PptCompressResult(before/after/%) → download (deriveCompressedName)
```

---

## Task 1: Pure plan module — classification, smaller-pick, naming, estimate

**Files:**
- Create: `src/lib/ppt/pptCompressPlan.ts`
- Test: `src/lib/ppt/pptCompressPlan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ppt/pptCompressPlan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  classifyMedia,
  pickSmaller,
  deriveCompressedName,
  estimatePptxSize,
  PRESET_JPEG_QUALITY,
} from "./pptCompressPlan";

describe("classifyMedia", () => {
  it("re-encodes jpg/jpeg as JPEG at the preset quality", () => {
    expect(classifyMedia("jpg", "medium")).toEqual({
      kind: "jpeg",
      quality: PRESET_JPEG_QUALITY.medium,
    });
    expect(classifyMedia("jpeg", "high")).toEqual({
      kind: "jpeg",
      quality: PRESET_JPEG_QUALITY.high,
    });
  });

  it("re-encodes png as PNG (format preserved, transparency safe)", () => {
    expect(classifyMedia("png", "low")).toEqual({
      kind: "png",
      quality: PRESET_JPEG_QUALITY.low,
    });
  });

  it("is case-insensitive on the extension", () => {
    expect(classifyMedia("JPG", "medium").kind).toBe("jpeg");
    expect(classifyMedia("PNG", "medium").kind).toBe("png");
  });

  it("passes through unsupported / vector / empty extensions", () => {
    expect(classifyMedia("emf", "high")).toEqual({ kind: "passthrough" });
    expect(classifyMedia("wmf", "high")).toEqual({ kind: "passthrough" });
    expect(classifyMedia("gif", "high")).toEqual({ kind: "passthrough" });
    expect(classifyMedia("svg", "high")).toEqual({ kind: "passthrough" });
    expect(classifyMedia("", "high")).toEqual({ kind: "passthrough" });
  });
});

describe("pickSmaller", () => {
  const orig = new Uint8Array([1, 2, 3, 4]);
  it("keeps the candidate when it is strictly smaller", () => {
    const cand = new Uint8Array([1, 2]);
    expect(pickSmaller(orig, cand)).toEqual({ bytes: cand, usedCandidate: true });
  });
  it("keeps the original when the candidate is larger or equal", () => {
    expect(pickSmaller(orig, new Uint8Array([1, 2, 3, 4, 5]))).toEqual({
      bytes: orig,
      usedCandidate: false,
    });
    expect(pickSmaller(orig, new Uint8Array([9, 9, 9, 9]))).toEqual({
      bytes: orig,
      usedCandidate: false,
    });
  });
  it("keeps the original when the candidate is null (re-encode failed)", () => {
    expect(pickSmaller(orig, null)).toEqual({ bytes: orig, usedCandidate: false });
  });
});

describe("deriveCompressedName", () => {
  it("inserts -compressed before the .pptx extension", () => {
    expect(deriveCompressedName("deck.pptx")).toBe("deck-compressed.pptx");
  });
  it("lower-cases the extension on output", () => {
    expect(deriveCompressedName("deck.PPTX")).toBe("deck-compressed.pptx");
  });
  it("only strips the trailing .pptx", () => {
    expect(deriveCompressedName("a.b.pptx")).toBe("a.b-compressed.pptx");
  });
  it("appends to names without a .pptx extension", () => {
    expect(deriveCompressedName("noext")).toBe("noext-compressed.pptx");
  });
  it("falls back to a generic name on empty input", () => {
    expect(deriveCompressedName("")).toBe("compressed.pptx");
  });
});

describe("estimatePptxSize", () => {
  it("shrinks only the recompressible portion by the preset ratio", () => {
    // 1000 total, 800 recompressible, medium ratio 0.6
    // (1000-800) + 800*0.6 = 200 + 480 = 680, under static upper (900)
    expect(estimatePptxSize(1000, 800, "medium")).toBe(680);
  });
  it("clamps to the static upper bound when the formula exceeds it", () => {
    // tiny recompressible share → formula ~1000 but high upper = 1000*0.75=750
    expect(estimatePptxSize(1000, 10, "high")).toBe(750);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/ppt/pptCompressPlan.test.ts`
Expected: FAIL — `Cannot find module './pptCompressPlan'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/ppt/pptCompressPlan.ts`:

```ts
export type CompressionPreset = "low" | "medium" | "high";

/** JPEG quality (0..1) per preset for media re-encoding. */
export const PRESET_JPEG_QUALITY: Record<CompressionPreset, number> = {
  low: 0.82,
  medium: 0.7,
  high: 0.55,
};

/** Extensions we attempt to recompress. Everything else passes through. */
export const RECOMPRESSIBLE_EXTS = new Set(["jpg", "jpeg", "png"]);

export type MediaAction =
  | { kind: "jpeg"; quality: number }
  | { kind: "png"; quality: number }
  | { kind: "passthrough" };

/**
 * Decide how to handle one media entry. We never change the container format
 * (jpeg stays jpeg, png stays png) so the media filename, slide rels, and
 * [Content_Types].xml stay byte-stable and PowerPoint always opens the output.
 */
export function classifyMedia(
  ext: string,
  preset: CompressionPreset,
): MediaAction {
  const e = ext.toLowerCase();
  const quality = PRESET_JPEG_QUALITY[preset];
  if (e === "jpg" || e === "jpeg") return { kind: "jpeg", quality };
  if (e === "png") return { kind: "png", quality };
  return { kind: "passthrough" };
}

export interface ChosenBytes {
  bytes: Uint8Array;
  usedCandidate: boolean;
}

/**
 * Keep the re-encoded candidate only when it is strictly smaller than the
 * original. A null candidate means re-encoding failed — keep the original.
 */
export function pickSmaller(
  original: Uint8Array,
  candidate: Uint8Array | null,
): ChosenBytes {
  if (!candidate || candidate.length >= original.length) {
    return { bytes: original, usedCandidate: false };
  }
  return { bytes: candidate, usedCandidate: true };
}

/**
 * Build the download filename for a compressed PPTX.
 * `"deck.pptx"` → `"deck-compressed.pptx"`; `""` → `"compressed.pptx"`.
 */
export function deriveCompressedName(originalName: string): string {
  if (!originalName) return "compressed.pptx";
  const lower = originalName.toLowerCase();
  const base = lower.endsWith(".pptx")
    ? originalName.slice(0, -5)
    : originalName;
  return `${base}-compressed.pptx`;
}

/** Fraction of recompressible bytes left after re-encoding at each preset. */
export const PRESET_IMAGE_RATIO: Record<CompressionPreset, number> = {
  low: 0.85,
  medium: 0.6,
  high: 0.45,
};

/** Whole-file [min,max] remaining range used as a static fallback estimate. */
export const PRESET_RANGE: Record<CompressionPreset, [number, number]> = {
  low: [0.85, 0.98],
  medium: [0.6, 0.9],
  high: [0.45, 0.75],
};

/**
 * Minimum recompressible-share before the derived estimate is shown.
 * Below the cutoff we display "≈ original size" instead of a misleading number.
 */
export const PRESET_IMAGE_SHARE_CUTOFF: Record<CompressionPreset, number> = {
  low: 0.15,
  medium: 0.05,
  high: 0.03,
};

/**
 * Estimate the compressed file size: the recompressible portion shrinks to
 * PRESET_IMAGE_RATIO, the rest is unchanged. Clamped by the static upper bound.
 */
export function estimatePptxSize(
  totalSize: number,
  recompressibleBytes: number,
  preset: CompressionPreset,
): number {
  const ratio = PRESET_IMAGE_RATIO[preset];
  const formula = totalSize - recompressibleBytes + recompressibleBytes * ratio;
  const staticUpper = totalSize * PRESET_RANGE[preset][1];
  return Math.min(formula, staticUpper);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/ppt/pptCompressPlan.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ppt/pptCompressPlan.ts src/lib/ppt/pptCompressPlan.test.ts
git commit -m "feat(ppt-compress): pure media-classification + estimate plan"
```

---

## Task 2: Pure integrity guard

**Files:**
- Create: `src/lib/ppt/pptCompressIntegrity.ts`
- Test: `src/lib/ppt/pptCompressIntegrity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ppt/pptCompressIntegrity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assertPptxIntegrity } from "./pptCompressIntegrity";

const base = {
  originalEntryNames: ["[Content_Types].xml", "ppt/slides/slide1.xml", "ppt/media/image1.jpg"],
  outputEntryNames: ["[Content_Types].xml", "ppt/slides/slide1.xml", "ppt/media/image1.jpg"],
  originalSlideCount: 1,
  outputSlideCount: 1,
  originalSize: 1000,
  compressedSize: 800,
};

describe("assertPptxIntegrity", () => {
  it("passes when entries, slide count, and size are intact", () => {
    expect(() => assertPptxIntegrity(base)).not.toThrow();
  });

  it("throws CORRUPT_OUTPUT when the entry count changed", () => {
    expect(() =>
      assertPptxIntegrity({
        ...base,
        outputEntryNames: ["[Content_Types].xml", "ppt/slides/slide1.xml"],
      }),
    ).toThrowError(/^CORRUPT_OUTPUT/);
  });

  it("throws CORRUPT_OUTPUT when an entry name disappeared (rename)", () => {
    expect(() =>
      assertPptxIntegrity({
        ...base,
        outputEntryNames: ["[Content_Types].xml", "ppt/slides/slide1.xml", "ppt/media/image1.png"],
      }),
    ).toThrowError(/^CORRUPT_OUTPUT/);
  });

  it("throws CORRUPT_OUTPUT when the slide count dropped", () => {
    expect(() =>
      assertPptxIntegrity({ ...base, outputSlideCount: 0 }),
    ).toThrowError(/^CORRUPT_OUTPUT/);
  });

  it("throws CORRUPT_OUTPUT when the output is empty", () => {
    expect(() =>
      assertPptxIntegrity({ ...base, compressedSize: 0 }),
    ).toThrowError(/^CORRUPT_OUTPUT/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/ppt/pptCompressIntegrity.test.ts`
Expected: FAIL — `Cannot find module './pptCompressIntegrity'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/ppt/pptCompressIntegrity.ts`:

```ts
export interface PptxIntegrityInput {
  originalEntryNames: string[];
  outputEntryNames: string[];
  originalSlideCount: number;
  outputSlideCount: number;
  originalSize: number;
  compressedSize: number;
}

/**
 * Defense-in-depth against a silently broken repackage. We only replace media
 * BYTES (never add/remove/rename entries, never touch slide XML), so the output
 * MUST contain exactly the same entry set and slide count. Any drift means the
 * output is unsafe to hand to PowerPoint.
 *
 * Throws with a `CORRUPT_OUTPUT:` prefix so getErrorMessage() maps it to the
 * friendly corrupt-output hint (see src/lib/errors.ts).
 */
export function assertPptxIntegrity(input: PptxIntegrityInput): void {
  const {
    originalEntryNames,
    outputEntryNames,
    originalSlideCount,
    outputSlideCount,
    compressedSize,
  } = input;

  if (compressedSize <= 0) {
    throw new Error("CORRUPT_OUTPUT: empty output");
  }

  if (originalEntryNames.length !== outputEntryNames.length) {
    throw new Error("CORRUPT_OUTPUT: entry count changed");
  }

  const out = new Set(outputEntryNames);
  for (const name of originalEntryNames) {
    if (!out.has(name)) {
      throw new Error("CORRUPT_OUTPUT: entry missing in output");
    }
  }

  if (originalSlideCount !== outputSlideCount) {
    throw new Error("CORRUPT_OUTPUT: slide count changed");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/ppt/pptCompressIntegrity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ppt/pptCompressIntegrity.ts src/lib/ppt/pptCompressIntegrity.test.ts
git commit -m "feat(ppt-compress): repackage integrity guard"
```

---

## Task 3: Browser orchestration — analyze + compress

**Files:**
- Create: `src/lib/ppt/compressPptx.ts`

> No node unit test: this module decodes images via `browser-image-compression`
> (canvas / Web Worker) which jsdom cannot run. It is verified by `tsc` + `build`
> and by the user's visual /qa (Task 9). All branchable logic it depends on is
> already unit-tested in Tasks 1–2.

- [ ] **Step 1: Write the implementation**

Create `src/lib/ppt/compressPptx.ts`:

```ts
import JSZip from "jszip";
import imageCompression from "browser-image-compression";
import { getExt, getMime } from "./pptImageFormats";
import { aggregateFormats, pickThumbnailPath } from "./analyzePresentation";
import {
  classifyMedia,
  pickSmaller,
  RECOMPRESSIBLE_EXTS,
  type CompressionPreset,
  type MediaAction,
} from "./pptCompressPlan";
import { assertPptxIntegrity } from "./pptCompressIntegrity";

const MEDIA_PREFIX = "ppt/media/";
const SLIDE_RE = /^ppt\/slides\/slide\d+\.xml$/;

// Image extensions counted as "images" in the preview breakdown.
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "tiff", "tif", "svg"]);

export interface PptxCompressAnalysis {
  totalSize: number;
  /** Sum of jpg/jpeg/png media byte lengths — drives the derived estimate. */
  recompressibleBytes: number;
  imageCount: number;
  formatCounts: Record<string, number>;
  thumbnailBlob: Blob | null;
  thumbnailMime: string | null;
}

export interface CompressPptxOptions {
  file: File;
  preset: CompressionPreset;
  onProgress?: (pct: number) => void;
}

export interface CompressPptxResult {
  data: Uint8Array;
  originalSize: number;
  compressedSize: number;
  ratio: number;
}

/**
 * Idle-time analysis: pull the embedded thumbnail, count images, and sum the
 * recompressible media bytes for the size estimate. One unzip per file.
 */
export async function analyzePptxForCompress(
  file: File,
): Promise<PptxCompressAnalysis> {
  const ab = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);

  const allPaths: string[] = [];
  const imageBaseNames: string[] = [];
  const recompressiblePaths: string[] = [];

  zip.forEach((path, entry) => {
    if (entry.dir) return;
    allPaths.push(path);
    if (!path.startsWith(MEDIA_PREFIX)) return;
    const base = path.split("/").pop();
    if (!base) return;
    const ext = getExt(base);
    if (IMAGE_EXTS.has(ext)) imageBaseNames.push(base);
    if (RECOMPRESSIBLE_EXTS.has(ext)) recompressiblePaths.push(path);
  });

  const { imageCount, formatCounts } = aggregateFormats(imageBaseNames);

  let recompressibleBytes = 0;
  for (const p of recompressiblePaths) {
    const entry = zip.file(p);
    if (!entry) continue;
    const bytes = await entry.async("uint8array");
    recompressibleBytes += bytes.length;
  }

  const thumbPath = pickThumbnailPath(allPaths);
  let thumbnailBlob: Blob | null = null;
  let thumbnailMime: string | null = null;
  if (thumbPath) {
    const entry = zip.file(thumbPath);
    if (entry) {
      const bytes = await entry.async("uint8array");
      thumbnailMime = getMime(getExt(thumbPath));
      // new Uint8Array(...) required for TS strict (BlobPart needs ArrayBuffer).
      thumbnailBlob = new Blob([new Uint8Array(bytes)], { type: thumbnailMime });
    }
  }

  return {
    totalSize: file.size,
    recompressibleBytes,
    imageCount,
    formatCounts,
    thumbnailBlob,
    thumbnailMime,
  };
}

async function recompressMedia(
  bytes: Uint8Array,
  action: Extract<MediaAction, { kind: "jpeg" | "png" }>,
): Promise<Uint8Array> {
  const mime = action.kind === "jpeg" ? "image/jpeg" : "image/png";
  // new Uint8Array(...) keeps BlobPart happy under TS strict.
  const inputFile = new File([new Uint8Array(bytes)], "m", { type: mime });
  const out = await imageCompression(inputFile, {
    maxSizeMB: Number.POSITIVE_INFINITY,
    initialQuality: action.quality, // ignored for PNG (lossless re-encode)
    useWebWorker: true,
    fileType: mime,
  });
  const buf = await out.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Unpack → re-encode each jpg/jpeg/png in ppt/media/* in place (same format,
 * same path) → repackage. Entries are never added, removed, or renamed, so the
 * slide rels and [Content_Types].xml stay valid. A post-repackage integrity
 * check re-opens the output and verifies the entry set + slide count survived.
 */
export async function compressPptx({
  file,
  preset,
  onProgress,
}: CompressPptxOptions): Promise<CompressPptxResult> {
  onProgress?.(5);
  const originalSize = file.size;
  const ab = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);

  const originalEntryNames: string[] = [];
  const mediaPaths: string[] = [];
  let originalSlideCount = 0;

  zip.forEach((path, entry) => {
    if (entry.dir) return;
    originalEntryNames.push(path);
    if (SLIDE_RE.test(path)) originalSlideCount++;
    if (path.startsWith(MEDIA_PREFIX) && RECOMPRESSIBLE_EXTS.has(getExt(path))) {
      mediaPaths.push(path);
    }
  });

  onProgress?.(15);
  const total = mediaPaths.length;
  for (let i = 0; i < total; i++) {
    const path = mediaPaths[i];
    const entry = zip.file(path);
    if (entry) {
      const original = await entry.async("uint8array");
      const action = classifyMedia(getExt(path), preset);
      if (action.kind !== "passthrough") {
        let candidate: Uint8Array | null = null;
        try {
          candidate = await recompressMedia(original, action);
        } catch {
          // Re-encode failure (corrupt/odd image) → keep the original bytes.
          candidate = null;
        }
        const chosen = pickSmaller(original, candidate);
        if (chosen.usedCandidate) {
          // Replace bytes at the SAME path; STORE because jpeg/png don't
          // benefit from DEFLATE and re-deflating wastes CPU.
          zip.file(path, chosen.bytes, { compression: "STORE" });
        }
      }
    }
    onProgress?.(15 + Math.round(((i + 1) / Math.max(total, 1)) * 70));
  }

  onProgress?.(88);
  const data = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  // Integrity: re-open the output and confirm nothing was dropped/renamed.
  const outZip = await JSZip.loadAsync(data);
  const outputEntryNames: string[] = [];
  let outputSlideCount = 0;
  outZip.forEach((path, entry) => {
    if (entry.dir) return;
    outputEntryNames.push(path);
    if (SLIDE_RE.test(path)) outputSlideCount++;
  });
  assertPptxIntegrity({
    originalEntryNames,
    outputEntryNames,
    originalSlideCount,
    outputSlideCount,
    originalSize,
    compressedSize: data.length,
  });

  onProgress?.(100);
  return {
    data,
    originalSize,
    compressedSize: data.length,
    ratio: originalSize > 0 ? data.length / originalSize : 1,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors in `src/lib/ppt/compressPptx.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ppt/compressPptx.ts
git commit -m "feat(ppt-compress): browser unpack/recompress/repackage core"
```

---

## Task 4: Registry + i18n

**Files:**
- Modify: `src/lib/constants.ts` (import + TOOLS entry)
- Modify: `src/i18n/dictionaries/ko.json` (tools["ppt-compress"])
- Modify: `src/i18n/dictionaries/en.json` (tools["ppt-compress"])

- [ ] **Step 1: Add the icon import in `src/lib/constants.ts`**

Modify the lucide import block (currently ends with `Presentation,`) to add `Minimize2`:

```ts
  Presentation,
  Minimize2,
  type LucideIcon,
} from "lucide-react";
```

- [ ] **Step 2: Add the TOOLS entry**

In `src/lib/constants.ts`, add to the `TOOLS` array (place right after the `ppt-extract` entry so the PPT family groups together):

```ts
  {
    slug: "ppt-compress",
    title: "PPT 용량 줄이기",
    description: "PPTX 속 이미지를 다시 압축해 파일 크기를 줄입니다.",
    i18nKey: "tools.ppt-compress",
    href: "/tools/ppt-compress",
    icon: Minimize2,
    category: "ppt",
    keywords: ["pptx", "compress", "압축", "용량", "ppt", "줄이기"],
  },
```

- [ ] **Step 3: Add the ko.json block**

In `src/i18n/dictionaries/ko.json`, inside `tools`, add after the `ppt-extract` block:

```json
    "ppt-compress": {
      "title": "PPT 용량 줄이기",
      "description": "PPTX 속 이미지를 다시 압축해 파일 크기를 줄입니다.",
      "page": {
        "uploadPrompt": "PPTX를 끌어다 놓거나 선택하세요",
        "uploadHint": "PPTX 파일 하나를 선택하세요.",
        "uploadMaxSize": "최대 {maxSize}",
        "reupload": "다시 선택",
        "reset": "처음으로",
        "fileInfo": "{name} · {size}",
        "presetGroupLabel": "압축 강도",
        "presetLightLabel": "약하게",
        "presetLightDesc": "품질 우선, 조금 줄어듦",
        "presetMediumLabel": "보통",
        "presetMediumDesc": "균형, 30–50% 줄어듦",
        "presetHeavyLabel": "강하게",
        "presetHeavyDesc": "강한 압축, 최대한 줄임",
        "compress": "PPT 압축하기",
        "processing": "압축 중…",
        "estimateTemplate": "예상 ~{from}–{to}",
        "estimateActualTemplate": "예상 ~{size}",
        "estimateNoChange": "~원본 크기와 유사",
        "resultTitle": "압축 결과",
        "originalSizeLabel": "원본 크기",
        "compressedSizeLabel": "압축 후",
        "savingsLabel": "절감률",
        "download": "다운로드",
        "again": "다시 압축",
        "analyzingHint": "분석 중…",
        "previewUnavailable": "미리보기를 만들 수 없습니다",
        "imagesLabel": "이미지",
        "imageCount": "{n}개",
        "noImagesHint": "압축할 이미지 없음",
        "errorMemory": "브라우저 메모리가 부족합니다. 더 작은 파일을 사용해 주세요.",
        "errorCorrupt": "압축 결과가 손상되어 사용할 수 없습니다. 다른 압축 강도로 시도해 주세요."
      }
    },
```

- [ ] **Step 4: Add the en.json block**

In `src/i18n/dictionaries/en.json`, inside `tools`, add after the `ppt-extract` block (mirror keys exactly):

```json
    "ppt-compress": {
      "title": "Compress PPT",
      "description": "Re-compress the images inside a PPTX to shrink the file.",
      "page": {
        "uploadPrompt": "Drag and drop a PPTX, or click to upload",
        "uploadHint": "Select a single PPTX file.",
        "uploadMaxSize": "Up to {maxSize}",
        "reupload": "Re-upload",
        "reset": "Start over",
        "fileInfo": "{name} · {size}",
        "presetGroupLabel": "Compression level",
        "presetLightLabel": "Light",
        "presetLightDesc": "Preserve quality, slightly smaller",
        "presetMediumLabel": "Medium",
        "presetMediumDesc": "Balanced, 30–50% smaller",
        "presetHeavyLabel": "Heavy",
        "presetHeavyDesc": "Aggressive, smallest size",
        "compress": "Compress PPT",
        "processing": "Compressing…",
        "estimateTemplate": "Est. ~{from}–{to}",
        "estimateActualTemplate": "Est. ~{size}",
        "estimateNoChange": "~similar to original",
        "resultTitle": "Compression result",
        "originalSizeLabel": "Original size",
        "compressedSizeLabel": "After",
        "savingsLabel": "Savings",
        "download": "Download",
        "again": "Compress again",
        "analyzingHint": "Analyzing…",
        "previewUnavailable": "Preview unavailable",
        "imagesLabel": "Images",
        "imageCount": "{n}",
        "noImagesHint": "No images to compress",
        "errorMemory": "Browser ran out of memory. Try a smaller file.",
        "errorCorrupt": "The compressed file is unusable. Try a different compression level."
      }
    },
```

- [ ] **Step 5: Type-check (Dictionary type derives from ko.json)**

Run: `pnpm tsc --noEmit`
Expected: no errors. (Both dictionaries now carry the `ppt-compress` block.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/constants.ts src/i18n/dictionaries/ko.json src/i18n/dictionaries/en.json
git commit -m "feat(ppt-compress): registry entry + ko/en dictionaries"
```

---

## Task 5: Labels adapter

**Files:**
- Create: `src/components/tools/ppt-compress/labels.ts`

- [ ] **Step 1: Write the implementation**

Create `src/components/tools/ppt-compress/labels.ts`:

```ts
import type { Dictionary } from "@/i18n/config";

export interface PptCompressLabels {
  title: string;
  description: string;
  uploadPrompt: string;
  uploadHint: string;
  uploadMaxSize: string;
  reupload: string;
  reset: string;
  fileInfoTemplate: string;
  presetGroupLabel: string;
  presetLightLabel: string;
  presetLightDesc: string;
  presetMediumLabel: string;
  presetMediumDesc: string;
  presetHeavyLabel: string;
  presetHeavyDesc: string;
  compress: string;
  processing: string;
  estimateTemplate: string;
  estimateActualTemplate: string;
  estimateNoChange: string;
  resultTitle: string;
  originalSizeLabel: string;
  compressedSizeLabel: string;
  savingsLabel: string;
  download: string;
  again: string;
  analyzingHint: string;
  previewUnavailable: string;
  imagesLabel: string;
  imageCountTemplate: string;
  noImagesHint: string;
  errorMemory: string;
  errorCorrupt: string;
  fileUpload: Dictionary["common"]["fileUpload"];
}

export function getPptCompressLabels(dict: Dictionary): PptCompressLabels {
  const t = dict.tools["ppt-compress"];
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
    estimateTemplate: p.estimateTemplate,
    estimateActualTemplate: p.estimateActualTemplate,
    estimateNoChange: p.estimateNoChange,
    resultTitle: p.resultTitle,
    originalSizeLabel: p.originalSizeLabel,
    compressedSizeLabel: p.compressedSizeLabel,
    savingsLabel: p.savingsLabel,
    download: p.download,
    again: p.again,
    analyzingHint: p.analyzingHint,
    previewUnavailable: p.previewUnavailable,
    imagesLabel: p.imagesLabel,
    imageCountTemplate: p.imageCount,
    noImagesHint: p.noImagesHint,
    errorMemory: p.errorMemory,
    errorCorrupt: p.errorCorrupt,
    fileUpload: dict.common.fileUpload,
  };
}
```

- [ ] **Step 2: Type-check & commit**

Run: `pnpm tsc --noEmit` → no errors.

```bash
git add src/components/tools/ppt-compress/labels.ts
git commit -m "feat(ppt-compress): labels adapter"
```

---

## Task 6: Controls + Estimate + Result + Preview components

**Files:**
- Create: `src/components/tools/ppt-compress/PptCompressControls.tsx`
- Create: `src/components/tools/ppt-compress/PptCompressEstimate.tsx`
- Create: `src/components/tools/ppt-compress/PptCompressResult.tsx`
- Create: `src/components/tools/ppt-compress/PptCompressPreview.tsx`

- [ ] **Step 1: Preset toggle**

Create `src/components/tools/ppt-compress/PptCompressControls.tsx`:

```tsx
"use client";

import type { CompressionPreset } from "@/lib/ppt/pptCompressPlan";
import type { PptCompressLabels } from "./labels";

interface PptCompressControlsProps {
  preset: CompressionPreset;
  onChange: (preset: CompressionPreset) => void;
  labels: PptCompressLabels;
  disabled?: boolean;
}

const TOGGLE =
  "nameplate h-8 flex-1 rounded-[9px] px-3 font-display text-[12px] font-medium";
const GROUP_LABEL =
  "font-display text-[11px] font-medium uppercase tracking-[0.08em]";

export function PptCompressControls({
  preset,
  onChange,
  labels,
  disabled = false,
}: PptCompressControlsProps) {
  const options: { value: CompressionPreset; label: string }[] = [
    { value: "low", label: labels.presetLightLabel },
    { value: "medium", label: labels.presetMediumLabel },
    { value: "high", label: labels.presetHeavyLabel },
  ];

  return (
    <div className="space-y-2">
      <p className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
        {labels.presetGroupLabel}
      </p>
      <div className="flex gap-1.5">
        {options.map((opt) => {
          const active = preset === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              data-active={active}
              disabled={disabled}
              className={TOGGLE}
              style={active ? undefined : { color: "var(--ink-strong)" }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Estimate line**

Create `src/components/tools/ppt-compress/PptCompressEstimate.tsx`:

```tsx
"use client";

import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import {
  estimatePptxSize,
  PRESET_RANGE,
  PRESET_IMAGE_SHARE_CUTOFF,
  type CompressionPreset,
} from "@/lib/ppt/pptCompressPlan";
import type { PptCompressLabels } from "./labels";

interface PptCompressEstimateProps {
  preset: CompressionPreset;
  originalSize: number;
  labels: PptCompressLabels;
  /** Recompressible (jpg/jpeg/png) media bytes. null = analysis pending/failed. */
  recompressibleBytes?: number | null;
}

export function PptCompressEstimate({
  preset,
  originalSize,
  labels,
  recompressibleBytes,
}: PptCompressEstimateProps) {
  const descMap: Record<CompressionPreset, string> = {
    low: labels.presetLightDesc,
    medium: labels.presetMediumDesc,
    high: labels.presetHeavyDesc,
  };

  let rangeText: string;
  if (recompressibleBytes != null && originalSize > 0) {
    const share = recompressibleBytes / originalSize;
    if (share >= PRESET_IMAGE_SHARE_CUTOFF[preset]) {
      const derived = Math.round(
        estimatePptxSize(originalSize, recompressibleBytes, preset),
      );
      rangeText = template(labels.estimateActualTemplate, {
        size: formatBytes(derived),
      });
    } else {
      rangeText = labels.estimateNoChange;
    }
  } else {
    const [lo, hi] = PRESET_RANGE[preset];
    const fromStr = formatBytes(Math.round(originalSize * lo));
    const toStr = formatBytes(Math.round(originalSize * hi));
    rangeText =
      fromStr === toStr
        ? fromStr
        : template(labels.estimateTemplate, { from: fromStr, to: toStr });
  }

  return (
    <div
      className="flex items-center justify-between gap-3 font-body text-[12px]"
      style={{ color: "var(--ink-soft)" }}
    >
      <span className="truncate">{descMap[preset]}</span>
      <span className="shrink-0 tabular-nums" style={{ color: "var(--ink)" }}>
        {rangeText}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Result card** (identical structure to PdfCompressResult; uses computeSavings)

Create `src/components/tools/ppt-compress/PptCompressResult.tsx`:

```tsx
"use client";

import { DownloadIcon, RotateCcwIcon } from "lucide-react";
import { formatBytes } from "@/lib/common/formatBytes";
import { computeSavings } from "@/lib/image/computeSavings";
import type { PptCompressLabels } from "./labels";

interface PptCompressResultProps {
  originalSize: number;
  compressedSize: number;
  onDownload: () => void;
  onAgain: () => void;
  labels: PptCompressLabels;
}

export function PptCompressResult({
  originalSize,
  compressedSize,
  onDownload,
  onAgain,
  labels,
}: PptCompressResultProps) {
  const { pct } = computeSavings(originalSize, compressedSize);

  return (
    <div
      className="flex flex-col gap-3 rounded-[8px] border p-4"
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
          <p className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
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
          <p className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
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
          <p className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
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

      <div className="flex flex-wrap gap-1.5">
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

- [ ] **Step 4: Preview (presentational thumbnail + image count)**

Create `src/components/tools/ppt-compress/PptCompressPreview.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { Minimize2Icon } from "lucide-react";
import { template } from "@/lib/common/template";
import { formatBreakdownString } from "@/lib/ppt/pptImageFormats";
import type { PptCompressLabels } from "./labels";

interface PptCompressPreviewProps {
  thumbnailUrl: string | null;
  analyzing: boolean;
  imageCount: number | null;
  formatCounts: Record<string, number> | null;
  labels: PptCompressLabels;
}

export function PptCompressPreview({
  thumbnailUrl,
  analyzing,
  imageCount,
  formatCounts,
  labels,
}: PptCompressPreviewProps) {
  const breakdown = useMemo(() => {
    if (!formatCounts || !imageCount) return "";
    const upper: Record<string, number> = {};
    for (const [ext, n] of Object.entries(formatCounts)) {
      upper[ext.toUpperCase()] = n;
    }
    return formatBreakdownString(upper);
  }, [formatCounts, imageCount]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[8px] border"
        style={{ background: "var(--silver-100)", borderColor: "var(--silver-200)" }}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            draggable={false}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-4 text-center">
            {analyzing ? (
              <span className="font-body text-[11.5px]" style={{ color: "var(--silver-600)" }}>
                {labels.analyzingHint}
              </span>
            ) : (
              <>
                <Minimize2Icon className="size-8" style={{ color: "var(--silver-500)" }} />
                <span className="font-body text-[11px]" style={{ color: "var(--silver-600)" }}>
                  {labels.previewUnavailable}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {imageCount != null && (
        <div
          className="flex items-baseline justify-between gap-2 px-1 font-body text-[11.5px]"
          style={{ color: "var(--ink-soft)" }}
        >
          <span style={{ color: "var(--ink-strong)" }}>
            {labels.imagesLabel}:{" "}
            <strong
              style={{ color: imageCount === 0 ? "var(--ink-soft)" : "var(--ink-strong)" }}
            >
              {template(labels.imageCountTemplate, { n: imageCount })}
            </strong>
          </span>
          <span className="truncate" title={breakdown || labels.noImagesHint}>
            {breakdown || labels.noImagesHint}
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Type-check & commit**

Run: `pnpm tsc --noEmit` → no errors.

```bash
git add src/components/tools/ppt-compress/PptCompressControls.tsx src/components/tools/ppt-compress/PptCompressEstimate.tsx src/components/tools/ppt-compress/PptCompressResult.tsx src/components/tools/ppt-compress/PptCompressPreview.tsx
git commit -m "feat(ppt-compress): controls, estimate, result, preview"
```

---

## Task 7: Main component (orchestration)

**Files:**
- Create: `src/components/tools/ppt-compress/PptCompress.tsx`

- [ ] **Step 1: Write the implementation**

Create `src/components/tools/ppt-compress/PptCompress.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minimize2Icon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { FILE_SIZE_LIMIT } from "@/lib/constants";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import {
  analyzePptxForCompress,
  compressPptx,
  type CompressPptxResult,
  type PptxCompressAnalysis,
} from "@/lib/ppt/compressPptx";
import {
  deriveCompressedName,
  type CompressionPreset,
} from "@/lib/ppt/pptCompressPlan";
import { PptCompressControls } from "./PptCompressControls";
import { PptCompressEstimate } from "./PptCompressEstimate";
import { PptCompressPreview } from "./PptCompressPreview";
import { PptCompressResult } from "./PptCompressResult";
import type { PptCompressLabels } from "./labels";

// .pptx only — legacy .ppt (CFB) is rejected by react-dropzone's accept filter.
const PPTX_ACCEPT = {
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
};

interface PptCompressProps {
  labels: PptCompressLabels;
  inline?: boolean;
}

export function PptCompress({ labels, inline = false }: PptCompressProps) {
  const [preset, setPreset] = useState<CompressionPreset>("medium");
  const [analysis, setAnalysis] = useState<PptxCompressAnalysis | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
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
    download,
  } = useToolProcessor<CompressPptxResult>({
    processor: (processorFiles, onProgress) =>
      compressPptx({ file: processorFiles[0], preset, onProgress }),
    onDownload: (res) =>
      downloadBlob(
        res.data,
        deriveCompressedName(filesRef.current[0]?.name ?? ""),
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
    errorOptions: {
      memoryHint: labels.errorMemory,
      corruptOutputHint: labels.errorCorrupt,
    },
  });

  useEffect(() => {
    filesRef.current = files;
  });

  const file = files[0];

  // Analyze once per file: thumbnail + recompressible byte total + counts.
  useEffect(() => {
    if (!file) {
      setAnalysis(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    setAnalyzing(true);
    setAnalysis(null);
    setThumbnailUrl(null);
    (async () => {
      try {
        const res = await analyzePptxForCompress(file);
        if (cancelled) return;
        setAnalysis(res);
        if (res.thumbnailBlob) {
          createdUrl = URL.createObjectURL(res.thumbnailBlob);
          setThumbnailUrl(createdUrl);
        }
      } catch {
        // Analysis failure is non-fatal: compression still works, the preview
        // just shows the placeholder and the estimate falls back to the range.
        if (!cancelled) setAnalysis(null);
      } finally {
        if (!cancelled) setAnalyzing(false);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [file]);

  const handleFilesChange = useCallback(
    (newFiles: File[]) => {
      retry();
      setFiles(newFiles.slice(0, 1));
    },
    [retry, setFiles],
  );

  const handleReupload = useCallback(() => reuploadInputRef.current?.click(), []);

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

  const handleAgain = useCallback(() => retry(), [retry]);

  const hasFile = !!file;
  const busy = status === "processing";
  const isDone = status === "done" && !!result;

  const fileInfo = file
    ? template(labels.fileInfoTemplate, {
        name: file.name,
        size: formatBytes(file.size),
      })
    : "";

  const handleCompressClick = useCallback(() => {
    if (!file) {
      toast.error(labels.uploadPrompt);
      return;
    }
    run();
  }, [file, run, labels.uploadPrompt]);

  const body = (
    <div className={inline ? "space-y-4" : "space-y-4 px-6 py-3"}>
      <input
        ref={reuploadInputRef}
        type="file"
        accept=".pptx"
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
          maxSize={FILE_SIZE_LIMIT.user}
          onFiles={handleFilesChange}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={{ ...labels.fileUpload, maxSize: labels.uploadMaxSize }}
        />
      ) : (
        <div
          className="grid grid-cols-1 gap-5 md:grid-cols-2"
          style={{ height: "52vh" }}
        >
          {/* LEFT: file info row + reupload → thumbnail preview */}
          <div className="flex h-full flex-col gap-2">
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
            <PptCompressPreview
              thumbnailUrl={thumbnailUrl}
              analyzing={analyzing}
              imageCount={analysis ? analysis.imageCount : null}
              formatCounts={analysis ? analysis.formatCounts : null}
              labels={labels}
            />
          </div>

          {/* RIGHT: compress button → preset → estimate, or result, or status */}
          {isDone && result ? (
            <div className="self-start">
              <PptCompressResult
                originalSize={result.originalSize}
                compressedSize={result.compressedSize}
                onDownload={download}
                onAgain={handleAgain}
                labels={labels}
              />
            </div>
          ) : status === "idle" ? (
            <div className="flex h-full flex-col gap-3">
              <button
                type="button"
                onClick={handleCompressClick}
                className="btn-primary glint inline-flex h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-[9px] px-4 font-display text-[13px] font-semibold"
              >
                {labels.compress}
              </button>
              <PptCompressControls
                preset={preset}
                onChange={setPreset}
                labels={labels}
                disabled={busy}
              />
              {file && (
                <PptCompressEstimate
                  preset={preset}
                  originalSize={file.size}
                  labels={labels}
                  recompressibleBytes={
                    analysis ? analysis.recompressibleBytes : null
                  }
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
          <Minimize2Icon size={18} />
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

- [ ] **Step 2: Type-check & commit**

Run: `pnpm tsc --noEmit` → no errors.

```bash
git add src/components/tools/ppt-compress/PptCompress.tsx
git commit -m "feat(ppt-compress): main orchestration component"
```

---

## Task 8: Route page

**Files:**
- Create: `src/app/[lang]/(chrome)/tools/ppt-compress/page.tsx`

- [ ] **Step 1: Write the implementation**

Create `src/app/[lang]/(chrome)/tools/ppt-compress/page.tsx`:

```tsx
import { getDictionary, type Locale } from "@/i18n/config";
import { locales } from "@/i18n/locales";
import { PptCompress } from "@/components/tools/ppt-compress/PptCompress";
import { getPptCompressLabels } from "@/components/tools/ppt-compress/labels";

interface PageProps {
  params: Promise<{ lang: string }>;
}

function asLocale(lang: string): Locale {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : "ko";
}

export default async function PptCompressPage({ params }: PageProps) {
  const { lang } = await params;
  const dict = await getDictionary(asLocale(lang));
  const labels = getPptCompressLabels(dict);

  return (
    <div
      className="mx-auto px-4 py-8"
      style={{
        width: "min(var(--tweak-workspace-width, 980px), calc(100vw - 32px))",
      }}
    >
      <PptCompress labels={labels} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/[lang]/(chrome)/tools/ppt-compress/page.tsx
git commit -m "feat(ppt-compress): route page"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Type-check the whole project**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Run the full unit suite**

Run: `pnpm vitest run`
Expected: all green, including `pptCompressPlan.test.ts` and `pptCompressIntegrity.test.ts`.

- [ ] **Step 3: Lint**

Run: `pnpm biome check src/lib/ppt src/components/tools/ppt-compress src/app/[lang]/\(chrome\)/tools/ppt-compress`
(or the project's configured lint command). Fix any reported issues.

- [ ] **Step 4: Production build**

Run: `pnpm build`
Expected: build succeeds; `/[lang]/tools/ppt-compress` appears in the route list and the tool shows in the desk grid (derived from TOOLS).

- [ ] **Step 5: User visual /qa (agent browse blocked — user drives)**

Hand off to the user for visual verification with real fixtures:
- `tests/fixtures/찬양맞추기.pptx` (17.7MB) → must be **accepted** (50MB limit), thumbnail + image count render.
- Compress at medium → progress advances (not stuck), result shows before/after + savings %.
- Download → output `.pptx` **opens in PowerPoint** with no repair prompt.
- Slide with a transparent PNG logo → transparency intact (PNG never converted to JPEG).
- `tests/fixtures/찬양피피티 모아놓기2.pptx` (9.9MB) → same checks; confirm meaningful size drop.
- Drop a `.ppt` (legacy) → rejected with the invalid-type toast (no crash).

- [ ] **Step 6: Final commit (if lint/build produced fixes)**

```bash
git add -A
git commit -m "chore(ppt-compress): lint + build fixes"
```

---

## Failure modes

| Codepath | Failure | Test | Error handling | User sees |
|---|---|---|---|---|
| `compressPptx` repackage | jszip drops/renames an entry | — (browser) | `assertPptxIntegrity` throws `CORRUPT_OUTPUT:` (unit-tested) | `errorCorrupt` message, retry |
| `recompressMedia` | one image fails to decode | — | try/catch → `candidate=null` → keep original | silent, original bytes kept (correct) |
| `compressPptx` | OOM on a near-50MB deck | — | `getErrorMessage` maps "memory"/"OOM" → `memoryHint` | `errorMemory` message |
| `analyzePptxForCompress` | thumbnail/zip parse fails | — | try/catch → analysis null | placeholder preview + range estimate (compression still works) |
| upload | 0 recompressible media | covered by `pickSmaller`/estimate cutoff | no-op compress, ~0% savings | result shows ~original size (informative) |

**No critical gaps:** every failure path has either error handling or a test, and none fail silently in a way the user can't recover from.

## NOT in scope (deferred)

- 전역 `FILE_SIZE_LIMIT` 상향 + OOM 방지 — 폴리싱 단계로 분리(Step 0 명시). 이번 PR은 ppt-compress만 50MB.
- PNG→JPEG 포맷 전환(파일명 rename + rels/Content_Types 재작성) — blast radius 큼, PowerPoint 열림 위험. in-place 동일포맷이 v1.
- 목표 용량(KB) 입력 모드 — IMPROVEMENTS 백로그.
- 슬라이드 실렌더 미리보기 — 브라우저에서 불가, docProps 썸네일로 대체.
- `.ppt`(legacy CFB) 압축 — .pptx 전용.
- media 중복 제거(같은 이미지 여러 슬라이드 공유 시 1회만 저장) — 별도 최적화, 추후.

## What already exists (reuse, not rebuilt)

- `aggregateFormats`, `pickThumbnailPath` (analyzePresentation.ts, 이미 export) — analyze에서 재사용.
- `getExt`, `getMime`, `formatBreakdownString` (pptImageFormats.ts) — 그대로.
- `useToolProcessor`, `formatBytes`, `template`, `computeSavings`, `downloadBlob`, `FileUpload`(`maxSize` prop), `ProcessingStatus`, `getErrorMessage`(`CORRUPT_OUTPUT:` 처리) — 그대로.
- pdf-compress UI 구조(2열 52vh, 프리셋 토글, 결과 카드, 파생 예상) — 패턴 차용(복사 아님, ppt 타입에 맞게 신설).

## Parallelization

Sequential implementation. Tasks 1–2 (pure) are independent of each other and could run in two lanes, but the chain 3→6→7→8 depends on them and on each other (shared `src/lib/ppt` + `src/components/tools/ppt-compress`). Single-developer sequential is the right call; no worktree split needed.

## Self-review

- **Spec coverage:** 6 locked decisions all mapped — #1 file structure (all tasks), #2 in-place same-format (Task 1 `classifyMedia` + Task 3), #3 presets (Task 6 Controls), #4 derived estimate + thumbnail (Tasks 3, 6), #5 .pptx-only accept (Task 7), #6 50MB via `maxSize` (Task 7). ✓
- **Placeholder scan:** none — every step has full code or exact commands. ✓
- **Type consistency:** `CompressionPreset` defined in `pptCompressPlan.ts` and imported everywhere; `CompressPptxResult`/`PptxCompressAnalysis` from `compressPptx.ts`; `PptCompressLabels` from `labels.ts`; `classifyMedia`/`pickSmaller`/`deriveCompressedName`/`estimatePptxSize` names match across plan↔compress↔components. ✓
