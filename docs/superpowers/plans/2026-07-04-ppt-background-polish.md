# ppt-background Polish (Layout Redesign) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ppt-background 워크스페이스를 v5 레이아웃으로 개편하고, done 상태를 공통 `ResultCard`로 이관하며, 슬라이드 비율 감지·현재 배경 dedup 그룹화·체크박스↔범위 바인딩을 추가한다. 동시에 후속 도구용 재사용 폴리싱 기준을 고정한다.

**Architecture:** 순수 로직(비율 감지·그룹화·범위 유니온)은 `src/lib/ppt`에 순수 함수로 분리해 TDD. 프레젠테이션은 소형 컴포넌트(`PptBackgroundResult`, `CurrentBackgroundFrame`, `PreviewLightbox`)로 나누고 `PptBackgroundTool`이 상태머신·조립을 담당. `changeBackground` XML 변환은 무변경(모드 매핑만 재사용).

**Tech Stack:** Next.js(App Router) · TypeScript(strict) · Vitest · JSZip · Tailwind v4 + globals.css @theme 토큰 · lucide(기존)/brand 라인 아이콘.

**Visual source of truth:** `docs/design-preview-ppt-background.html` (v5). 마크업 구조·오버레이 위치·토큰은 이 파일을 픽셀 레퍼런스로 삼는다.

**Spec:** `docs/superpowers/specs/2026-07-04-ppt-background-polish-design.md`

---

## File Structure

**Create:**
- `src/lib/ppt/getSlideAspect.ts` — presentation.xml `sldSz`에서 종횡비 산출.
- `src/lib/ppt/getSlideAspect.test.ts`
- `src/lib/ppt/groupBackgrounds.ts` — `SlideBackground[]` → dedup 그룹.
- `src/lib/ppt/groupBackgrounds.test.ts`
- `src/components/tools/ppt-background/PptBackgroundResult.tsx` — 정본 결과카드.
- `src/components/tools/ppt-background/CurrentBackgroundFrame.tsx` — dedup 그룹 프레임(페이저·체크·카운트·줌).
- `src/components/tools/ppt-background/PreviewLightbox.tsx` — 우패널 확대 오버레이.
- `src/components/tools/ppt-background/SelectedBackgroundFrame.tsx` — 선택 배경 프레임(줌).
- `docs/agents/tool-polishing-checklist.md` — 재사용 기준.

**Modify:**
- `src/lib/ppt/extractCurrentBackgrounds.ts` — `imagePath` 캡처(그룹 키).
- `src/lib/gallery/types.ts` — `GalleryCategory` = gradient|nature|object.
- `src/lib/gallery/mockData.ts` — texture/pattern → object 재버킷.
- `src/components/tools/ppt-background/BackgroundPicker.tsx` — 갤러리 전용(카테고리 탭 + 업로드 버튼).
- `src/components/tools/ppt-background/PptBackgroundTool.tsx` — 레이아웃/상태머신 재작성.
- `src/components/tools/ppt-background/labels.ts` — 라벨 매핑 반영.
- `src/components/ppt/InlineGallery.tsx` — 카테고리 탭 구조 확인/조정(필요 시).
- `src/i18n/dictionaries/ko.json`, `en.json` — mode(전체/마스터/선택)·gallery 카테고리·스트립 크기.

**Delete (rewrite 후 미사용 시):**
- `src/components/tools/ppt-background/SlideThumbStrip.tsx` — 전 슬라이드 나열 폐기(현재 배경 프레임으로 대체). 참조 제거 후 삭제.

---

## Task 1: `getSlideAspect` — 슬라이드 종횡비 감지

**Files:**
- Create: `src/lib/ppt/getSlideAspect.ts`
- Test: `src/lib/ppt/getSlideAspect.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/ppt/getSlideAspect.test.ts
import { describe, it, expect } from "vitest";
import { aspectFromSldSz, type SlideAspect } from "./getSlideAspect";

describe("aspectFromSldSz", () => {
  it("classifies 16:9 (12192000 x 6858000)", () => {
    const a: SlideAspect = aspectFromSldSz(12192000, 6858000);
    expect(a.kind).toBe("16:9");
    expect(a.ratio).toBeCloseTo(16 / 9, 3);
  });

  it("classifies 4:3 (9144000 x 6858000)", () => {
    expect(aspectFromSldSz(9144000, 6858000).kind).toBe("4:3");
  });

  it("falls back to raw ratio for non-standard sizes", () => {
    const a = aspectFromSldSz(1000, 1000);
    expect(a.kind).toBe("other");
    expect(a.ratio).toBeCloseTo(1, 3);
  });

  it("defaults to 16:9 when dimensions are missing/invalid", () => {
    expect(aspectFromSldSz(0, 0).kind).toBe("16:9");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/ppt/getSlideAspect.test.ts`
Expected: FAIL — `aspectFromSldSz` not defined.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/ppt/getSlideAspect.ts
import JSZip from "jszip";

export interface SlideAspect {
  /** "16:9" | "4:3" | "other" — drives the preview frame aspect-ratio. */
  kind: "16:9" | "4:3" | "other";
  /** width / height. */
  ratio: number;
}

const R_16_9 = 16 / 9;
const R_4_3 = 4 / 3;
const TOL = 0.02;

export function aspectFromSldSz(cx: number, cy: number): SlideAspect {
  if (!cx || !cy || cx <= 0 || cy <= 0) {
    return { kind: "16:9", ratio: R_16_9 };
  }
  const ratio = cx / cy;
  if (Math.abs(ratio - R_16_9) < TOL) return { kind: "16:9", ratio };
  if (Math.abs(ratio - R_4_3) < TOL) return { kind: "4:3", ratio };
  return { kind: "other", ratio };
}

/** Read ppt/presentation.xml <p:sldSz cx cy/> and classify. Never throws. */
export async function getSlideAspect(file: File): Promise<SlideAspect> {
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const xml = await zip.file("ppt/presentation.xml")?.async("text");
    const m = xml?.match(/<p:sldSz[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
    if (!m) return { kind: "16:9", ratio: R_16_9 };
    return aspectFromSldSz(parseInt(m[1], 10), parseInt(m[2], 10));
  } catch {
    return { kind: "16:9", ratio: R_16_9 };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/ppt/getSlideAspect.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ppt/getSlideAspect.ts src/lib/ppt/getSlideAspect.test.ts
git commit -m "feat(ppt-background): detect slide aspect ratio from sldSz"
```

---

## Task 2: `extractCurrentBackgrounds` — 그룹 키(`imagePath`) 캡처

**Files:**
- Modify: `src/lib/ppt/extractCurrentBackgrounds.ts`

이 태스크는 실제 pptx zip 구조에 의존하므로 순수 유닛테스트 대신 타입/빌드 + Task 4의 그룹화 테스트로 검증한다.

- [ ] **Step 1: `SlideBackground`에 `imagePath` 추가**

`extractCurrentBackgrounds.ts`의 인터페이스를 수정:

```typescript
export interface SlideBackground {
  slideIndex: number;
  slideName: string;
  imageBlob: Blob | null;
  source: "slide" | "layout" | "master" | "none";
  /** Resolved zip path of the background image part — the dedup key. null when source==="none". */
  imagePath: string | null;
}
```

- [ ] **Step 2: `resolveBlipImage`가 경로도 반환하도록 변경**

`resolveBlipImage`의 반환을 `Promise<Blob | null>` → `Promise<{ blob: Blob; path: string } | null>`로 바꾸고, 마지막 `return new Blob(...)` 을:

```typescript
  const blob = new Blob([data], { type: mimeMap[ext] ?? "application/octet-stream" });
  return { blob, path: targetPath };
```

각 호출부(directBg/layoutBg/masterBg)를 아래 형태로 갱신 — 예 (directBg):

```typescript
    const directBg = await resolveBlipImage(zip, "ppt/slides", `slide${slideNum}.xml`, slideXml);
    if (directBg) {
      bg.imageBlob = directBg.blob;
      bg.imagePath = directBg.path;
      bg.source = "slide";
      results.push(bg);
      continue;
    }
```

`layoutBg`·`masterBg`도 동일 패턴(`bg.imagePath = X.path`). 초기 `bg` 객체에 `imagePath: null` 추가. `source: "none"` 경로는 `imagePath` 그대로 null.

- [ ] **Step 3: 타입 체크**

Run: `pnpm tsc --noEmit`
Expected: PASS (호출부 없음/타입 정합).

- [ ] **Step 4: Commit**

```bash
git add src/lib/ppt/extractCurrentBackgrounds.ts
git commit -m "feat(ppt-background): capture resolved image path as dedup key"
```

---

## Task 3: `groupBackgrounds` — 배경 종류별 dedup

**Files:**
- Create: `src/lib/ppt/groupBackgrounds.ts`
- Test: `src/lib/ppt/groupBackgrounds.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/ppt/groupBackgrounds.test.ts
import { describe, it, expect } from "vitest";
import { groupBackgrounds } from "./groupBackgrounds";
import type { SlideBackground } from "./extractCurrentBackgrounds";

function bg(i: number, path: string | null, source: SlideBackground["source"]): SlideBackground {
  return { slideIndex: i, slideName: `슬라이드 ${i}`, imageBlob: null, source, imagePath: path };
}

describe("groupBackgrounds", () => {
  it("dedups slides that share an image path into one group", () => {
    const groups = groupBackgrounds([
      bg(1, "ppt/media/a.png", "slide"),
      bg(2, "ppt/media/a.png", "slide"),
      bg(3, "ppt/media/b.png", "layout"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].slideIndexes).toEqual([1, 2]);
    expect(groups[1].slideIndexes).toEqual([3]);
  });

  it("groups all source==='none' slides under a single 'none' group", () => {
    const groups = groupBackgrounds([bg(1, null, "none"), bg(2, null, "none")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("none");
    expect(groups[0].slideIndexes).toEqual([1, 2]);
  });

  it("preserves first-seen order and keeps a representative blob", () => {
    const groups = groupBackgrounds([bg(2, "x", "slide"), bg(1, "x", "slide")]);
    expect(groups[0].slideIndexes).toEqual([2, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/ppt/groupBackgrounds.test.ts`
Expected: FAIL — `groupBackgrounds` not defined.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/ppt/groupBackgrounds.ts
import type { SlideBackground } from "./extractCurrentBackgrounds";

export interface BackgroundGroup {
  /** Dedup key: imagePath, or "none" for slides with no resolved background. */
  key: string;
  source: SlideBackground["source"];
  /** Representative image blob for the preview (first slide in the group). */
  imageBlob: Blob | null;
  /** 1-based slide indexes sharing this background, in first-seen order. */
  slideIndexes: number[];
}

/**
 * Collapse per-slide backgrounds into distinct groups. Slides whose resolved
 * background image (imagePath) matches are one group; all source==="none"
 * slides collapse into a single "none" group. First-seen order preserved.
 */
export function groupBackgrounds(bgs: SlideBackground[]): BackgroundGroup[] {
  const byKey = new Map<string, BackgroundGroup>();
  for (const b of bgs) {
    const key = b.source === "none" || !b.imagePath ? "none" : b.imagePath;
    const existing = byKey.get(key);
    if (existing) {
      existing.slideIndexes.push(b.slideIndex);
    } else {
      byKey.set(key, {
        key,
        source: b.source,
        imageBlob: b.imageBlob,
        slideIndexes: [b.slideIndex],
      });
    }
  }
  return [...byKey.values()];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/ppt/groupBackgrounds.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ppt/groupBackgrounds.ts src/lib/ppt/groupBackgrounds.test.ts
git commit -m "feat(ppt-background): dedup current backgrounds into groups"
```

---

## Task 4: `groupsToRangeText` — 체크된 그룹 → 범위 문자열

**Files:**
- Create: `src/lib/ppt/groupsToRangeText.ts`
- Test: `src/lib/ppt/groupsToRangeText.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/ppt/groupsToRangeText.test.ts
import { describe, it, expect } from "vitest";
import { groupsToRangeText } from "./groupsToRangeText";
import type { BackgroundGroup } from "./groupBackgrounds";

function g(key: string, idx: number[]): BackgroundGroup {
  return { key, source: "slide", imageBlob: null, slideIndexes: idx };
}

describe("groupsToRangeText", () => {
  it("serializes the union of checked groups into canonical ranges", () => {
    const groups = [g("a", [1, 2, 3, 4]), g("b", [9, 10]), g("c", [7])];
    const text = groupsToRangeText(groups, new Set(["a", "c"]));
    expect(text).toBe("1-4, 7");
  });

  it("returns empty string when nothing is checked", () => {
    expect(groupsToRangeText([g("a", [1])], new Set())).toBe("");
  });

  it("merges adjacent indexes across groups", () => {
    const groups = [g("a", [1, 2]), g("b", [3, 4])];
    expect(groupsToRangeText(groups, new Set(["a", "b"]))).toBe("1-4");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/ppt/groupsToRangeText.test.ts`
Expected: FAIL — not defined.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/ppt/groupsToRangeText.ts
import { serializeRange } from "@/lib/common/pageRange";
import type { BackgroundGroup } from "./groupBackgrounds";

/** Union the slideIndexes of every checked group into a canonical "1-4, 7" string. */
export function groupsToRangeText(
  groups: BackgroundGroup[],
  checkedKeys: Set<string>,
): string {
  const set = new Set<number>();
  for (const grp of groups) {
    if (checkedKeys.has(grp.key)) {
      for (const i of grp.slideIndexes) set.add(i);
    }
  }
  return serializeRange(set);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/ppt/groupsToRangeText.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ppt/groupsToRangeText.ts src/lib/ppt/groupsToRangeText.test.ts
git commit -m "feat(ppt-background): union checked background groups into range text"
```

---

## Task 5: `PptBackgroundResult` — 정본 결과카드

**Files:**
- Create: `src/components/tools/ppt-background/PptBackgroundResult.tsx`

- [ ] **Step 1: 컴포넌트 작성 (공통 `ResultCard`/`ResultActions` 조립)**

```tsx
// src/components/tools/ppt-background/PptBackgroundResult.tsx
"use client";

import { ResultCard } from "@/components/common/ResultCard";
import { ResultActions } from "@/components/common/ResultActions";

interface PptBackgroundResultProps {
  /** e.g. "완료" — labels.processing.done */
  title: string;
  /** Short summary line, e.g. "20개 슬라이드 배경을 변경했습니다." (optional) */
  summary?: string;
  downloadLabel: string;
  againLabel: string;
  onDownload: () => void;
  onAgain: () => void;
}

export function PptBackgroundResult({
  title,
  summary,
  downloadLabel,
  againLabel,
  onDownload,
  onAgain,
}: PptBackgroundResultProps) {
  return (
    <ResultCard
      title={title}
      actions={
        <ResultActions
          download={{ label: downloadLabel, onClick: onDownload }}
          again={{ label: againLabel, onClick: onAgain }}
        />
      }
    >
      {summary && (
        <p className="font-body text-[12px]" style={{ color: "var(--ink)" }}>
          {summary}
        </p>
      )}
    </ResultCard>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/ppt-background/PptBackgroundResult.tsx
git commit -m "feat(ppt-background): canonical ResultCard for done state"
```

---

## Task 6: `PreviewLightbox` — 우패널 확대 오버레이

**Files:**
- Create: `src/components/tools/ppt-background/PreviewLightbox.tsx`

- [ ] **Step 1: 컴포넌트 작성**

돋보기/닫기 아이콘은 brand 규격(24 그리드·stroke 1.0·currentColor·round). 오버레이는 부모 패널(`position:relative`)의 `inset:0`을 채움.

```tsx
// src/components/tools/ppt-background/PreviewLightbox.tsx
"use client";

interface PreviewLightboxProps {
  /** Image URL to enlarge. */
  src: string;
  alt: string;
  /** Aspect ratio class token — "16 / 9" | "4 / 3". */
  aspect: string;
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
        className="max-h-full max-w-full overflow-hidden rounded-[8px] border"
        style={{ borderColor: "var(--border)", boxShadow: "var(--shadow-lg)", aspectRatio: aspect }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="size-full object-contain" />
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="absolute right-2.5 top-2.5 flex size-8 items-center justify-center rounded-[8px] border"
        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink-strong)" }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 6 L18 18 M18 6 L6 18" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크 + Commit**

Run: `pnpm tsc --noEmit` → PASS.

```bash
git add src/components/tools/ppt-background/PreviewLightbox.tsx
git commit -m "feat(ppt-background): right-pane preview lightbox"
```

---

## Task 7: `SelectedBackgroundFrame` — 선택 배경 프레임(줌 트리거)

**Files:**
- Create: `src/components/tools/ppt-background/SelectedBackgroundFrame.tsx`

- [ ] **Step 1: 컴포넌트 작성**

프레임은 컬럼 폭 100%, `aspectRatio`는 슬라이드 비율. 호버 시 우상단 돋보기. 비어있으면 플레이스홀더.

```tsx
// src/components/tools/ppt-background/SelectedBackgroundFrame.tsx
"use client";

interface SelectedBackgroundFrameProps {
  caption: string;
  previewUrl: string | null;
  /** "16 / 9" | "4 / 3" */
  aspect: string;
  emptyLabel: string;
  zoomLabel: string;
  onZoom: () => void;
}

export function SelectedBackgroundFrame({
  caption,
  previewUrl,
  aspect,
  emptyLabel,
  zoomLabel,
  onZoom,
}: SelectedBackgroundFrameProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="font-body text-[10.5px]" style={{ color: "var(--ink-soft)" }}>
        {caption}
      </div>
      <div
        className="group relative w-full overflow-hidden rounded-[8px] border"
        style={{ background: "var(--surface-2)", borderColor: "var(--border)", aspectRatio: aspect }}
      >
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt={caption} className="size-full object-cover" />
            <button
              type="button"
              onClick={onZoom}
              aria-label={zoomLabel}
              className="absolute right-1.5 top-1.5 hidden size-6 items-center justify-center rounded-[6px] group-hover:flex"
              style={{ background: "color-mix(in oklch, var(--surface) 85%, transparent)", color: "var(--ink-strong)", backdropFilter: "blur(4px)" }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="M15.2 15.2 L20 20" />
              </svg>
            </button>
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center font-body text-[10.5px]" style={{ color: "var(--ink-soft)" }}>
            {emptyLabel}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크 + Commit**

Run: `pnpm tsc --noEmit` → PASS.

```bash
git add src/components/tools/ppt-background/SelectedBackgroundFrame.tsx
git commit -m "feat(ppt-background): selected-background preview frame with zoom"
```

---

## Task 8: `CurrentBackgroundFrame` — dedup 그룹 프레임

**Files:**
- Create: `src/components/tools/ppt-background/CurrentBackgroundFrame.tsx`

프레임 오버레이: 좌상단 체크박스, 좌하단 ‹ › 페이저, 우상단 돋보기(호버), 우하단 `슬라이드 {n}장`. 페이지는 `BackgroundGroup[]` 인덱스. 체크는 부모가 `checkedKeys`로 소유(양방향 바인딩은 Task 9에서 결선).

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// src/components/tools/ppt-background/CurrentBackgroundFrame.tsx
"use client";

import { template } from "@/lib/common/template";
import type { BackgroundGroup } from "@/lib/ppt/groupBackgrounds";

interface CurrentBackgroundFrameProps {
  caption: string;
  groups: BackgroundGroup[];
  /** blob object URLs keyed by group.key (owned/managed by parent). */
  thumbUrls: Map<string, string>;
  index: number;
  onIndex: (next: number) => void;
  checkedKeys: Set<string>;
  onToggleCheck: (key: string) => void;
  /** "16 / 9" | "4 / 3" */
  aspect: string;
  /** "슬라이드 {n}장" */
  slideCountTemplate: string;
  emptyLabel: string;
  zoomLabel: string;
  onZoom: () => void;
}

export function CurrentBackgroundFrame(props: CurrentBackgroundFrameProps) {
  const { caption, groups, thumbUrls, index, onIndex, checkedKeys, onToggleCheck,
    aspect, slideCountTemplate, emptyLabel, zoomLabel, onZoom } = props;
  const group = groups[index];
  const url = group ? thumbUrls.get(group.key) ?? null : null;
  const checked = group ? checkedKeys.has(group.key) : false;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="font-body text-[10.5px]" style={{ color: "var(--ink-soft)" }}>
        {caption}
      </div>
      <div
        className="group relative w-full overflow-hidden rounded-[8px] border"
        style={{ background: "var(--surface-2)", borderColor: "var(--border)", aspectRatio: aspect }}
      >
        {group ? (
          <>
            {url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={url} alt={caption} className="size-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center font-body text-[10.5px]" style={{ color: "var(--ink-soft)" }}>
                {emptyLabel}
              </div>
            )}

            {/* checkbox (top-left) */}
            <button
              type="button"
              onClick={() => onToggleCheck(group.key)}
              aria-pressed={checked}
              className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-[5px] border"
              style={{
                background: checked ? "var(--emphasis)" : "color-mix(in oklch, var(--surface) 55%, transparent)",
                borderColor: checked ? "var(--emphasis)" : "color-mix(in oklch, var(--surface) 85%, transparent)",
                color: "var(--mono-0)", backdropFilter: "blur(3px)",
              }}
            >
              {checked && (
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12 L10 17 L19 7" />
                </svg>
              )}
            </button>

            {/* zoom (top-right, hover) */}
            <button
              type="button"
              onClick={onZoom}
              aria-label={zoomLabel}
              className="absolute right-1.5 top-1.5 hidden size-6 items-center justify-center rounded-[6px] group-hover:flex"
              style={{ background: "color-mix(in oklch, var(--surface) 85%, transparent)", color: "var(--ink-strong)", backdropFilter: "blur(4px)" }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.2 15.2 L20 20" />
              </svg>
            </button>

            {/* pager (bottom-left) — only when >1 group */}
            {groups.length > 1 && (
              <div className="absolute bottom-1.5 left-1.5 flex gap-1">
                {(["prev", "next"] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => onIndex((index + (dir === "next" ? 1 : -1) + groups.length) % groups.length)}
                    aria-label={dir}
                    className="flex size-5 items-center justify-center rounded-[5px] font-body text-[11px]"
                    style={{ background: "color-mix(in oklch, var(--surface) 82%, transparent)", color: "var(--ink-strong)", backdropFilter: "blur(4px)" }}
                  >
                    {dir === "next" ? "›" : "‹"}
                  </button>
                ))}
              </div>
            )}

            {/* slide count (bottom-right) */}
            <div
              className="absolute bottom-1.5 right-1.5 rounded-[4px] px-2 py-0.5 font-body text-[10px] font-medium"
              style={{ background: "color-mix(in oklch, var(--surface) 82%, transparent)", color: "var(--ink-strong)", backdropFilter: "blur(4px)" }}
            >
              {template(slideCountTemplate, { n: group.slideIndexes.length })}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center font-body text-[10.5px]" style={{ color: "var(--ink-soft)" }}>
            {emptyLabel}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크 + Commit**

Run: `pnpm tsc --noEmit` → PASS.

```bash
git add src/components/tools/ppt-background/CurrentBackgroundFrame.tsx
git commit -m "feat(ppt-background): current-background dedup frame (pager/check/count/zoom)"
```

---

## Task 9: `GalleryCategory` 구조 정비 (gradient/nature/object)

**Files:**
- Modify: `src/lib/gallery/types.ts`, `src/lib/gallery/mockData.ts`

- [ ] **Step 1: 타입 변경**

`src/lib/gallery/types.ts`:

```typescript
export type GalleryCategory = "gradient" | "nature" | "object";

export const GALLERY_CATEGORIES: GalleryCategory[] = ["gradient", "nature", "object"];
```

- [ ] **Step 2: mockData 재버킷**

`src/lib/gallery/mockData.ts`에서 기존 `category: "texture"` 및 `category: "pattern"` 항목을 모두 `category: "object"`로 치환(값만 변경, 이미지 소스는 유지). `nature`/`gradient`는 유지.

- [ ] **Step 3: 타입 체크**

Run: `pnpm tsc --noEmit`
Expected: FAIL — `labels.ts`/i18n의 `categoryByKey`가 texture/pattern 키를 참조. Task 10/11에서 해소하므로, 이 커밋은 Task 10·11과 함께 검증한다. (지금은 변경만.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/gallery/types.ts src/lib/gallery/mockData.ts
git commit -m "feat(gallery): collapse categories to gradient/nature/object"
```

---

## Task 10: i18n — mode(전체/마스터/선택) · gallery 카테고리

**Files:**
- Modify: `src/i18n/dictionaries/ko.json`, `src/i18n/dictionaries/en.json`, `src/components/tools/ppt-background/labels.ts`

- [ ] **Step 1: ko.json `tools.ppt-background.page` 수정**

- `mode.optionSpecific`: `"지정"` → `"선택"`.
- `mode.specificHint`: `"현재 배경을 체크하거나 범위를 직접 입력하세요"`.
- `gallery`: `categoryTexture`/`categoryPattern` 제거, `categoryObject: "사물"` 추가. (`categoryGradient`/`categoryNature` 유지.)

- [ ] **Step 2: en.json 대응 수정**

- `mode.optionSpecific`: `"Select"`.
- `mode.specificHint`: `"Check a current background or type a range"`.
- `gallery.categoryObject`: `"Object"`; `categoryTexture`/`categoryPattern` 제거.

- [ ] **Step 3: `labels.ts`의 `categoryByKey` 재작성**

```typescript
  const categoryByKey: Record<GalleryCategory, string> = {
    gradient: p.gallery.categoryGradient,
    nature: p.gallery.categoryNature,
    object: p.gallery.categoryObject,
  };
```

- [ ] **Step 4: 타입 체크**

Run: `pnpm tsc --noEmit`
Expected: PASS (Dictionary 타입이 새 키에 정합; texture/pattern 참조 제거됨). 실패 시 `Dictionary` 생성 위치(`i18n/config.ts`) 확인 — JSON 기반 추론이면 자동 반영.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/dictionaries/ko.json src/i18n/dictionaries/en.json src/components/tools/ppt-background/labels.ts
git commit -m "i18n(ppt-background): 선택 mode label + 사물/object category"
```

---

## Task 11: `BackgroundPicker` — 갤러리 전용(카테고리 탭 + 업로드 버튼)

**Files:**
- Modify: `src/components/tools/ppt-background/BackgroundPicker.tsx`
- Check: `src/components/ppt/InlineGallery.tsx` (카테고리 탭이 이미 있는지 확인 후 재사용)

기존 BackgroundPicker의 책임을 분리: 미리보기/actionSlot/toggle 제거. 남는 것 = 카테고리 탭 + 업로드 버튼(텍스트만) + 갤러리 그리드. 미리보기는 Task 12에서 우패널 상단으로 이동.

- [ ] **Step 1: `InlineGallery` API 확인**

Read `src/components/ppt/InlineGallery.tsx` — 이미 category 필터/탭을 렌더하는지 확인. 렌더한다면 BackgroundPicker는 InlineGallery를 그대로 쓰고 업로드 버튼만 추가. 안 하면 카테고리 탭을 BackgroundPicker에 구현하고 `onSelect`로 필터.

- [ ] **Step 2: BackgroundPicker 재작성 (갤러리 전용)**

`v5` 목업의 LEFT 패널 구조를 따른다: 헤더 행(좌 카테고리 탭 + 우 업로드 버튼) + 그리드. 업로드 버튼은 숨은 `<input type=file accept=image/png,image/jpeg>`를 트리거하고 `onDirectUpload(files)` 호출. 프리뷰/토글 관련 props(`bgFile`,`bgPreviewUrl`,`actionSlot`,`sourceUpload`,`sourceGallery`) 제거, `onDirectUpload`·`onGallerySelect`·`galleryImage`·`labels.gallery`·`labels.uploadLabel`만 유지.

```tsx
// 핵심 골격 (클래스/토큰은 v5 목업 .gal-head / .upload-btn / .gallery-grid 참조)
<div className="flex h-full min-h-0 flex-col gap-2.5">
  <div className="flex items-center justify-between gap-2 border-b" style={{ borderColor: "var(--hairline)" }}>
    {/* category tabs — GALLERY_CATEGORIES.map + labels.gallery.categoryAll */}
    {/* upload button (text-only) → hidden input trigger */}
  </div>
  <div className="min-h-0 flex-1 overflow-y-auto">
    <InlineGallery onSelect={onGallerySelect} selectedImageId={galleryImage?.id} forceOpen category={activeCategory} labels={labels.gallery} />
  </div>
</div>
```

업로드 버튼:

```tsx
<button type="button" onClick={() => inputRef.current?.click()}
  className="subtle-action shrink-0 rounded-[6px] border px-2.5 py-1.5 font-body text-[11px]"
  style={{ borderColor: "var(--border)", color: "var(--ink-strong)" }}>
  {labels.uploadLabel}
</button>
<input ref={inputRef} type="file" accept="image/png,image/jpeg" className="hidden"
  onChange={(e) => { const f = e.target.files ? Array.from(e.target.files) : []; if (f.length) onDirectUpload(f); e.target.value = ""; }} />
```

카테고리 탭 상태 `activeCategory`는 BackgroundPicker 로컬(`useState<GalleryCategory | "all">("all")`).

- [ ] **Step 3: 타입 체크**

Run: `pnpm tsc --noEmit`
Expected: FAIL — `PptBackgroundTool`이 아직 제거된 props를 전달. Task 12에서 해소. (이 커밋은 Task 12와 함께 빌드 검증.)

- [ ] **Step 4: Commit**

```bash
git add src/components/tools/ppt-background/BackgroundPicker.tsx
git commit -m "feat(ppt-background): gallery-only picker (category tabs + upload button)"
```

---

## Task 12: `PptBackgroundTool` — 레이아웃/상태머신 재작성

**Files:**
- Modify: `src/components/tools/ppt-background/PptBackgroundTool.tsx`
- Delete (after): `src/components/tools/ppt-background/SlideThumbStrip.tsx`

이 태스크가 핵심 조립이다. `v5` 목업이 픽셀 레퍼런스. 큰 단위이므로 하위 스텝으로 나눈다.

- [ ] **Step 1: 상태·유도값 추가**

기존 state에 더해:
```tsx
const [slideAspect, setSlideAspect] = useState<SlideAspect>({ kind: "16:9", ratio: 16 / 9 });
const [groups, setGroups] = useState<BackgroundGroup[]>([]);
const [groupThumbUrls, setGroupThumbUrls] = useState<Map<string, string>>(new Map());
const [curIndex, setCurIndex] = useState(0);
const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
const [rangeText, setRangeText] = useState("");
const [zoom, setZoom] = useState<null | "selected" | "current">(null);
const aspectCss = slideAspect.kind === "4:3" ? "4 / 3" : slideAspect.kind === "16:9" ? "16 / 9" : `${slideAspect.ratio}`;
```
`mode`는 유지하되 UI 라벨만 전체/마스터/선택. `selectedSlides`(Set)는 `rangeText`로 대체 → `parseRange(rangeText, totalSlides)`로 `targetSlides` 산출.

- [ ] **Step 2: pptx 로드 시 aspect + groups 계산**

기존 `extractCurrentBackgrounds` effect를 확장: 성공 시 `groupBackgrounds(bgs)`로 그룹 생성, 각 그룹 대표 blob → object URL 맵 생성(기존 slide별 URL 맵 대신). `getSlideAspect(pptxFile)`도 병행 호출해 `setSlideAspect`. 파일 해제/언마운트 시 그룹 URL revoke(기존 정리 패턴을 group URL로 교체). `setCurIndex(0)`, `setCheckedKeys(new Set())`, `setRangeText("")` 리셋.

- [ ] **Step 3: 양방향 바인딩 핸들러**

```tsx
const onToggleCheck = useCallback((key: string) => {
  setMode("specific-slides");
  setCheckedKeys((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    setRangeText(groupsToRangeText(groups, next));
    return next;
  });
}, [groups]);

const onRangeEdit = useCallback((v: string) => {
  setRangeText(v);
  setCheckedKeys(new Set()); // manual edit clears checks
}, []);

const onModeChange = useCallback((next: BgMode) => {
  setMode(next);
  if (next !== "specific-slides") { setCheckedKeys(new Set()); setRangeText(""); }
}, []);
```

`canRun`: `!!pptxFile && !!bgFile && (mode !== "specific-slides" || parseRange(rangeText, totalSlides).size > 0) && status === "idle"`.
`run` processor의 `targetSlides`: `mode === "specific-slides" ? [...parseRange(rangeText, totalSlides)].sort((a,b)=>a-b) : undefined`.

- [ ] **Step 4: 렌더 — 스트립(크기 추가) + 되돌리기 버튼 제거**

- 헤더의 우상단 `onReset` RotateCcw 버튼 블록 **삭제**. `onReset` 콜백도 제거.
- `ToolTopStrip`의 `filesSummary`는 파일명 유지, `meta`를 `· {size} · {n} 슬라이드` 로:
```tsx
meta={
  <span className="shrink-0 font-body text-[12px]" style={{ color: "var(--ink-soft)" }}>
    {`· ${formatBytes(pptxFile.size)}`}{totalSlides > 0 ? ` · ${template(labels.fileStatus.slideCountTemplate, { n: totalSlides })}` : ` · ${labels.fileStatus.analyzing}`}
  </span>
}
```
`onExecute={status === "idle" ? run : undefined}`, `executeLabel={labels.action.apply}`(=변경하기), `executeDisabled={!canRun}` 유지.

- [ ] **Step 5: 렌더 — 본문 2패널 (좌 갤러리 / 우 미리보기+범위)**

`v5` 목업의 `.body` 구조. 좌: `<BackgroundPicker … />`(Task 11 시그니처). 우패널(`position:relative`):
- idle: `<div className="flex gap-3.5">` 안에 `<SelectedBackgroundFrame … onZoom={()=>setZoom("selected")} />` + `<CurrentBackgroundFrame groups={groups} thumbUrls={groupThumbUrls} index={curIndex} onIndex={setCurIndex} checkedKeys={checkedKeys} onToggleCheck={onToggleCheck} aspect={aspectCss} … onZoom={()=>setZoom("current")} />`. 그 아래 `mt-auto` 블록에 적용 범위: 라벨 + 동적(`선택`이면 텍스트 input(`value={rangeText}` `onChange`→`onRangeEdit`), `마스터`면 note, else 빈칸) + `ModeSelector`(전체/마스터/선택).
- processing/error: `<ProcessingStatus status progress errorMessage onRetry={retry} labels={labels.processing} />` 로 우패널 채움.
- done: `<PptBackgroundResult title={labels.processing.done} downloadLabel={labels.processing.download} againLabel={labels.processing.tryAnother} onDownload={download} onAgain={handleTryAnother} />`.
- `zoom !== null` && (선택/현재 blob URL 존재) 시 `<PreviewLightbox src=… aspect={aspectCss} closeLabel=… onClose={()=>setZoom(null)} />` 오버레이.

`ModeSelector`의 라벨을 `optionAll/optionMaster/optionSpecific`(=전체/마스터/선택) 그대로 전달, `onChange={onModeChange}`.

- [ ] **Step 6: SlideThumbStrip 참조 제거 후 삭제**

`PptBackgroundTool`에서 `SlideThumbStrip`·`PageRangeSelector` import 제거(범위는 이제 단순 input). 미사용 확인 후:
```bash
git rm src/components/tools/ppt-background/SlideThumbStrip.tsx
```
`PptBackgroundToolLabels`에서 `thumbnails`·`mode.specificSelectAll`·`mode.specificClear` 등 미사용 필드 정리(labels.ts·i18n 동기화는 최소 침습으로 — 미사용 키 남겨도 무방하면 남기고 TODO 없이 주석).

- [ ] **Step 7: 타입 체크 + 빌드**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A src/components/tools/ppt-background/ src/i18n
git commit -m "feat(ppt-background): redesign workspace layout + unified result card"
```
(주의: 저장소 관례상 `git add -A` 전체 금지 — 위는 경로 한정. 개별 파일 나열 권장.)

---

## Task 13: 재사용 폴리싱 기준 문서

**Files:**
- Create: `docs/agents/tool-polishing-checklist.md`

- [ ] **Step 1: 문서 작성 (스펙 §7 A~E 차원)**

A(로직·정확성)·B(디자인 정합)·C(UI 안정성 계약)·D(카피·i18n)·E(공통 규격 준수)를 체크리스트로. "각 도구 완료 시 design-preview.html에 설계 기록 접어 넣고 작업 파일 삭제" 절차 포함. `docs/design-preview.html`·`docs/brand.html`·`DESIGN.md`·관련 메모리 링크.

- [ ] **Step 2: Commit**

```bash
git add docs/agents/tool-polishing-checklist.md
git commit -m "docs(agents): reusable tool-polishing checklist (from ppt-background)"
```

---

## Task 14: 설계 기록 이관 + 검증

**Files:**
- Modify: `docs/design-preview.html` (설계 기록 섹션 추가)
- Delete: `docs/design-preview-ppt-background.html`

- [ ] **Step 1: design-preview.html에 ppt-background 설계 기록 섹션 추가**

v5 레이아웃의 확정 구조 + 설계 의도(왜 이렇게 배치했는지)를 정적 섹션으로. 인터랙티브 토글은 제거하고 결정된 최종형만.

- [ ] **Step 2: 작업용 목업 삭제**

```bash
git rm docs/design-preview-ppt-background.html
```

- [ ] **Step 3: 전체 검증**

Run: `pnpm test && pnpm tsc --noEmit && pnpm build && pnpm lint && pnpm design:check`
Expected: 전부 PASS.

- [ ] **Step 4: 사용자 시각 검증 (dev는 사용자가 기동, /browse 금지)**

실제 .pptx로 확인 요청:
- 16:9 및 4:3 덱에서 두 미리보기 프레임 비율 정확·상단 정렬·아래 갤러리/범위 위치 불변.
- 다중 배경 덱: 현재 배경 프레임이 종류 수만큼 페이지네이션, `슬라이드 n장` 정확.
- 체크박스 → '선택'+범위 자동입력, 텍스트 수정 시 체크 해제.
- 돋보기 → 우패널 확대, X 닫기.
- 변경하기(스트립)·done 결과카드·다운로드·다시 하기·다시 업로드 동작. 헤더 되돌리기 버튼 부재.
- EN 로케일 누수 0.

- [ ] **Step 5: Commit**

```bash
git add docs/design-preview.html
git commit -m "docs: fold ppt-background design record into design-preview, drop working mockup"
```

---

## Self-Review (작성자 확인 완료)

- **Spec coverage:** §4 레이아웃→T11·T12 / §5.1 비율→T1 / §5.2 dedup→T2·T3 / §5.3 바인딩→T4·T12 / §5.4 매핑→T12 / §5.5 카테고리→T9·T10 / §6 컴포넌트→T5~T12 / §7 기준→T13 / §8 i18n→T10 / §9 검증→T14 / done 이관→T5·T12. 누락 없음.
- **Placeholder scan:** 코드 스텝은 실제 코드 포함. 대형 rewrite(T11·T12)는 목업을 픽셀 레퍼런스로 명시하고 핵심 시그니처·핸들러·골격 제공(전문 복붙이 아닌, 결선 지점 명확화).
- **Type consistency:** `SlideBackground.imagePath`(T2) → `groupBackgrounds`(T3) → `BackgroundGroup`(T3) → `groupsToRangeText`(T4)·`CurrentBackgroundFrame`(T8)·`PptBackgroundTool`(T12) 시그니처 일치. `GalleryCategory` gradient/nature/object(T9)가 labels/i18n(T10)과 정합. `SlideAspect`(T1)→aspectCss(T12) 일치.
- **주의(구현자):** T9·T11은 단독 커밋 시 일시적 타입 에러(후속 태스크가 해소) — 커밋 메시지에 반영됨. subagent 실행 시 T9→T10, T11→T12를 연속 처리.
