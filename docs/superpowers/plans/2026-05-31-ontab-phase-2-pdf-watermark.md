# PDF 워터마크 / 페이지번호 (pdf-watermark) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브라우저에서 PDF에 페이지번호를 찍거나 워터마크(한글 텍스트 / 로고 이미지)를 얹는 신규 도구 `/tools/pdf-watermark`를 추가한다. 100% 클라이언트, 0 서버, 신규 의존성 0.

**Architecture:** pdf-lib(설치됨)로 PDF를 열고, 오버레이를 **PNG 이미지로 만들어 각 페이지에 그린다**. 한글 텍스트는 오프스크린 캔버스에 이미 로드된 Pretendard로 고DPI 렌더 후 `embedPng` → `drawImage`. 로고는 업로드 이미지 바이트를 직접 `embedPng/embedJpg`. 좌표(9분할 앵커·타일 위치·페이지번호 포맷·범위)는 순수 함수로 분리해 100% 단위 테스트한다. 미리보기는 self-host pdfjs(`getPdfjsLib`)로 1페이지를 렌더하고 **동일한 순수 좌표 함수**로 오버레이를 그려 export와 일치시킨다. 출력은 재오픈해 페이지 수 불변을 무결성 가드로 검증한다.

**Tech Stack:** Next.js(App Router) · TypeScript strict · pdf-lib(설치됨) · pdfjs-dist(설치됨, self-host) · Canvas 2D(내장) · Vitest · **신규 의존성 0**.

**Locked decisions (from /plan-eng-review 2026-05-31):**
1. **스코프 = 풀스코프 한 번에 (D1).** 페이지번호 모드 + 워터마크 모드(텍스트 / 로고 이미지) + 9분할 위치 + 포맷 프리셋 + 적용 페이지 범위 + 투명도 + 회전(대각선) + 타일반복 + 라이브 미리보기. 모두 이번 PR.
2. **한글 텍스트 렌더링 = 캔버스 래스터 → PNG 임베드 (D2).** pdf-lib 표준폰트엔 한글 글리프가 없음. `@pdf-lib/fontkit` + 한글 TTF 서브셋 임베드(신규 의존성 + 에셋 무게, pdf-compress식 글리프 손상 위험)를 피하고, 이미 로드된 Pretendard로 캔버스에 그려 PNG로 얹는다. 신규 의존성 0, 한글 깨짐 위험 0. 트레이드오프(텍스트 비선택/비검색)는 워터마크·페이지번호 용도에 무관.
3. **per-tool 파일 구조** — pdf-compress/ppt-compress 형제와 동일. 순수 로직(좌표·포맷·범위·파일명) / 브라우저(캔버스 렌더·pdf-lib 적용) / UI 분리.
4. **용량 한도 = 이 도구만 50MB** (`FILE_SIZE_LIMIT.user`를 FileUpload `maxSize` prop로 전달). 170MB급 대용량 PDF는 거부(invalid-type/too-large 토스트). 전역 한도 상향+OOM 방지는 폴리싱으로 분리.
5. **미리보기 = 1페이지 정적 렌더 + 오버레이** (pdf-compress 라이브 패턴 차용). 페이지 네비게이션은 NOT in scope.

---

## File Structure

**Pure logic (node vitest, 100% branch coverage):**
- `src/lib/pdf/pageNumberFormat.ts` — `formatPageNumber({ index, total, start, format })` → 표시 문자열. 포맷: `plain`("{n}"), `fraction`("{n} / {total}"), `dash`("- {n} -"), `ko`("{n}쪽").
- `src/lib/pdf/overlayLayout.ts` — `computeAnchor(grid, pageW, pageH, contentW, contentH, margin)` → `{ x, y }` (pdf-lib 좌표계, 좌하단 원점); `computeTilePositions(pageW, pageH, tileW, tileH, gapX, gapY)` → `{ x, y }[]`; `clampOpacity`, `degToRad` 보조.
- `src/lib/pdf/watermarkNaming.ts` — `deriveOutputName(name, mode)` → `"-numbered" | "-watermarked"` 접미사 삽입.

**Browser orchestration (tsc/build + 사용자 시각 /qa):**
- `src/lib/pdf/renderTextToPng.ts` — 오프스크린 캔버스에 텍스트를 고DPI 렌더 → `{ bytes: Uint8Array, width, height }`(논리 px). jsdom 캔버스 불가 → 단위 테스트 없음(tsc/build + /qa).
- `src/lib/pdf/applyPdfOverlay.ts` — `analyzePdfForOverlay(file)`(pdfjs: 페이지 수·1페이지 크기), `applyOverlay({ file, options, onProgress })`(pdf-lib 로드→임베드→페이지별 그리기→무결성→bytes).

**UI (사용자 시각 /qa):**
- `src/components/tools/pdf-watermark/labels.ts`
- `src/components/tools/pdf-watermark/PdfWatermarkModeToggle.tsx` — 페이지번호 / 워터마크 토글(ModeSelector 패턴).
- `src/components/tools/pdf-watermark/PageNumberControls.tsx` — 9분할 위치·포맷·시작번호·폰트크기·범위.
- `src/components/tools/pdf-watermark/WatermarkControls.tsx` — 텍스트/로고 토글·텍스트입력·로고업로드·투명도·회전·타일·색상·범위.
- `src/components/tools/pdf-watermark/PdfWatermarkPreview.tsx` — pdfjs 1페이지 렌더 + 오버레이(절대배치 캔버스).
- `src/components/tools/pdf-watermark/PdfWatermarkResult.tsx` — 결과(페이지 수·다운로드·다시).
- `src/components/tools/pdf-watermark/PdfWatermark.tsx` — 오케스트레이션(useToolProcessor).
- `src/app/[lang]/(chrome)/tools/pdf-watermark/page.tsx` — 라우트(형제 page.tsx 미러).

**Registry + i18n:**
- `src/lib/constants.ts` — TOOLS 엔트리 + 아이콘 import(`Stamp` 또는 `Type`/`Hash`; lucide 확인 후 선택).
- `src/i18n/dictionaries/ko.json` · `en.json` — `tools["pdf-watermark"]` 블록(`page.*`).

**Wiring (놓치면 데스크 카드가 레거시 fallback으로 떨어짐 — ppt-compress 교훈):**
- `src/components/landing/Screen3Workspace.tsx` — import + `renderToolBody()` switch에 `case "pdf-watermark"` 추가.

**Reused as-is (복사 금지):** `useToolProcessor`, `FileUpload`(`maxSize` prop), `ProcessingStatus`, `getErrorMessage`(`CORRUPT_OUTPUT:` 프리픽스), `parseRange`(`lib/common/pageRange.ts`), `formatBytes`, `template`, `downloadBlob`, `getPdfjsLib`(`lib/pdf/pdfjs.ts`), 52vh 2열 레이아웃, 4역할 버튼 클래스, silver 토큰.

### Data flow

```
upload PDF (≤50MB)
   │
   ├─ analyzePdfForOverlay(file)             [idle, 1회/파일]
   │     getPdfjsLib → getDocument → numPages, page1 {w,h}
   │
   ├─ live preview (PdfWatermarkPreview)
   │     pdfjs render page1 → <canvas>
   │     오버레이 = 동일 순수 함수(computeAnchor / computeTilePositions /
   │                formatPageNumber)로 그린 절대배치 캔버스 (export와 1:1)
   │
   └─ [적용] run → applyOverlay({ file, options })
         pdf-lib load
         build overlay png(s):
            number 모드: 페이지별 text=formatPageNumber(i,total,start,format)
                         → renderTextToPng → embedPng (문자열별 캐시)
            watermark/text: renderTextToPng(text,color,size) → embedPng (1회)
            watermark/logo: 업로드 bytes → embedPng|embedJpg (1회)
         for page in parseRange(rangeInput, total):
            number: drawImage(png, computeAnchor(grid,...))
            watermark: for pos in (tile? computeTilePositions : [computeAnchor]):
                          drawImage(wm, { ...pos, opacity, rotate: degToRad(angle) })
         save → bytes
         re-open(pdf-lib) → assert pageCount 불변 + bytes>0  (CORRUPT_OUTPUT:)
         return { data, pageCount, appliedPages }
         │
         └─ PdfWatermarkResult → download (deriveOutputName)
```

---

## Task 1: Pure — page number formatting

**Files:** Create `src/lib/pdf/pageNumberFormat.ts` + `.test.ts`

- [ ] **Step 1: Failing test** (`pageNumberFormat.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { formatPageNumber, PAGE_NUMBER_FORMATS } from "./pageNumberFormat";

describe("formatPageNumber", () => {
  it("plain shows the displayed number (start offset applied)", () => {
    expect(formatPageNumber({ index: 0, total: 10, start: 1, format: "plain" })).toBe("1");
    expect(formatPageNumber({ index: 2, total: 10, start: 1, format: "plain" })).toBe("3");
    expect(formatPageNumber({ index: 0, total: 10, start: 5, format: "plain" })).toBe("5");
  });
  it("fraction shows displayed/total-relative", () => {
    // total displayed = total - (start-1)?? No: total is page count; fraction uses page count.
    expect(formatPageNumber({ index: 0, total: 10, start: 1, format: "fraction" })).toBe("1 / 10");
    expect(formatPageNumber({ index: 9, total: 10, start: 1, format: "fraction" })).toBe("10 / 10");
  });
  it("dash wraps the number", () => {
    expect(formatPageNumber({ index: 1, total: 3, start: 1, format: "dash" })).toBe("- 2 -");
  });
  it("ko appends 쪽 (Korean glyph survives — canvas path)", () => {
    expect(formatPageNumber({ index: 0, total: 3, start: 1, format: "ko" })).toBe("1쪽");
  });
  it("exposes the format list for the controls", () => {
    expect(PAGE_NUMBER_FORMATS).toContain("plain");
    expect(PAGE_NUMBER_FORMATS).toContain("fraction");
  });
});
```

- [ ] **Step 2: run → FAIL** (`pnpm vitest run src/lib/pdf/pageNumberFormat.test.ts`)
- [ ] **Step 3: Implement**

```ts
export const PAGE_NUMBER_FORMATS = ["plain", "fraction", "dash", "ko"] as const;
export type PageNumberFormat = (typeof PAGE_NUMBER_FORMATS)[number];

export interface FormatPageNumberInput {
  /** 0-based page index within the document. */
  index: number;
  /** Total page count of the document. */
  total: number;
  /** Displayed number for the first page (1 = natural). */
  start: number;
  format: PageNumberFormat;
}

/** Map a page index to its displayed string. Pure — drives both preview and export. */
export function formatPageNumber({ index, total, start, format }: FormatPageNumberInput): string {
  const n = index + start;
  switch (format) {
    case "fraction":
      return `${n} / ${total}`;
    case "dash":
      return `- ${n} -`;
    case "ko":
      return `${n}쪽`;
    case "plain":
    default:
      return `${n}`;
  }
}
```

- [ ] **Step 4: run → PASS** · **Step 5: commit** `feat(pdf-watermark): pure page-number formatting`

---

## Task 2: Pure — overlay layout (anchors, tiles, helpers)

**Files:** Create `src/lib/pdf/overlayLayout.ts` + `.test.ts`

> pdf-lib 좌표계는 **좌하단 원점**, y가 위로 증가. `drawImage`는 이미지의 좌하단을 (x,y)에 둔다. 앵커는 이미지 박스(contentW×contentH)와 margin을 고려해 9분할 위치를 계산한다.

- [ ] **Step 1: Failing test** (`overlayLayout.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import {
  computeAnchor, computeTilePositions, clampOpacity, degToRad, GRID_POSITIONS,
} from "./overlayLayout";

const page = { w: 200, h: 100 };
const box = { w: 40, h: 10 };
const m = 5;

describe("computeAnchor (bottom-left origin)", () => {
  it("bottom-left sits at the margin", () => {
    expect(computeAnchor("bottom-left", page.w, page.h, box.w, box.h, m)).toEqual({ x: 5, y: 5 });
  });
  it("top-right accounts for box size + margin", () => {
    // x = 200 - 40 - 5 = 155 ; y = 100 - 10 - 5 = 85
    expect(computeAnchor("top-right", page.w, page.h, box.w, box.h, m)).toEqual({ x: 155, y: 85 });
  });
  it("center is geometric center of the box", () => {
    // x = (200-40)/2 = 80 ; y = (100-10)/2 = 45
    expect(computeAnchor("center", page.w, page.h, box.w, box.h, m)).toEqual({ x: 80, y: 45 });
  });
  it("bottom-center centers x, margins y", () => {
    expect(computeAnchor("bottom-center", page.w, page.h, box.w, box.h, m)).toEqual({ x: 80, y: 5 });
  });
  it("exposes all 9 grid positions", () => {
    expect(GRID_POSITIONS).toHaveLength(9);
  });
});

describe("computeTilePositions", () => {
  it("covers the page on a regular grid", () => {
    const pts = computeTilePositions(200, 100, 40, 10, 60, 40);
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.every((p) => p.x >= 0 && p.y >= 0)).toBe(true);
  });
  it("returns at least one tile even when the tile is larger than the page", () => {
    expect(computeTilePositions(50, 50, 200, 200, 10, 10).length).toBeGreaterThanOrEqual(1);
  });
});

describe("helpers", () => {
  it("clampOpacity bounds to [0,1]", () => {
    expect(clampOpacity(-1)).toBe(0);
    expect(clampOpacity(2)).toBe(1);
    expect(clampOpacity(0.5)).toBe(0.5);
  });
  it("degToRad converts", () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI);
  });
});
```

- [ ] **Step 2: run → FAIL** · **Step 3: Implement** (좌하단 원점, 9 grid: `top/middle/bottom` × `left/center/right`). `computeTilePositions`는 `tileW+gapX`, `tileH+gapY` 간격으로 0..page를 덮되 최소 1개 보장. `clampOpacity`/`degToRad`는 산술.
- [ ] **Step 4: run → PASS** · **Step 5: commit** `feat(pdf-watermark): pure overlay layout (anchors, tiles)`

---

## Task 3: Pure — output naming

**Files:** Create `src/lib/pdf/watermarkNaming.ts` + `.test.ts`

- [ ] Test: `deriveOutputName("doc.pdf","number")` → `"doc-numbered.pdf"`; `("doc.pdf","watermark")` → `"doc-watermarked.pdf"`; 확장자 대문자 소문자화; 무확장자 append; 빈 입력 → `"output-numbered.pdf"`/`"output-watermarked.pdf"`. (deriveCompressedName 패턴 미러.)
- [ ] Implement · run → PASS · commit `feat(pdf-watermark): pure output naming`

---

## Task 4: Browser — text→png canvas renderer

**Files:** Create `src/lib/pdf/renderTextToPng.ts`

> 단위 테스트 없음(jsdom 캔버스 불가). tsc/build + /qa로 검증. 모든 분기 로직은 Task 1–2에서 테스트됨.

```ts
/** Render text to a high-DPI PNG. Uses the app's already-loaded Pretendard so
 *  Korean glyphs render correctly (zero font-embedding, zero new dependency).
 *  Returns logical (CSS-px) width/height; the PNG bitmap is SCALE× larger for crispness. */
export interface RenderedText { bytes: Uint8Array; width: number; height: number; }
const SCALE = 4; // print-crisp at typical PDF DPI

export async function renderTextToPng(opts: {
  text: string; fontPx: number; color: string;
  fontFamily?: string; // default: the loaded Pretendard stack
  padding?: number;
}): Promise<RenderedText> { /* measureText → size canvas → fillText → toBlob('image/png') → Uint8Array */ }
```

- [ ] Implement (offscreen `document.createElement("canvas")`, `ctx.scale(SCALE,SCALE)`, `ctx.font = \`${fontPx}px ${family}\``, measure, fill). 한글 폰트 로드 보장: `await document.fonts.ready` 후 렌더.
- [ ] tsc → no error · commit `feat(pdf-watermark): canvas text→png renderer`

---

## Task 5: Browser — pdf-lib apply + analyze

**Files:** Create `src/lib/pdf/applyPdfOverlay.ts`

- [ ] `analyzePdfForOverlay(file)`: `getPdfjsLib` → `getDocument({ data, ...pdfjsDocParams })` → `{ numPages, firstPageWidth, firstPageHeight }`(viewport scale 1).
- [ ] `applyOverlay({ file, options, onProgress })`:
  - `PDFDocument.load(bytes)` (암호화/손상 → throw → friendly error).
  - 모드 분기:
    - **number**: 문자열별 PNG 캐시(`Map<string, embedded>`), 페이지별 `formatPageNumber` → `computeAnchor(grid, pw, ph, scaledW, scaledH, margin)` → `page.drawImage`.
    - **watermark/text**: `renderTextToPng` 1회 → embed → `tile ? computeTilePositions : [computeAnchor]` 각 위치 `drawImage({ opacity: clampOpacity(o), rotate: degrees(angle) })`.
    - **watermark/logo**: 업로드 bytes sniff(`%PNG`/`\xFF\xD8`) → `embedPng|embedJpg` → 위와 동일 배치.
  - 적용 페이지 = `parseRange(rangeInput, numPages)` (빈 입력 → 전체).
  - PNG 임베드 크기 → PDF 포인트 변환: `drawImage` 폭/높이 = `logicalPx`(=72dpi 기준 1:1; fontPx를 pt로 직접 사용).
  - 무결성: 출력 재오픈 → `pageCount` 불변 + `bytes.length>0` 아니면 `throw "CORRUPT_OUTPUT: ..."`.
  - `onProgress` 단계 보고.
- [ ] tsc → no error · commit `feat(pdf-watermark): pdf-lib overlay apply + analyze`

---

## Task 6: Registry + i18n

- [ ] `src/lib/constants.ts`: 아이콘 import(lucide에서 `Stamp` 존재 확인 후 사용; 없으면 `Type`) + TOOLS 엔트리(slug `pdf-watermark`, category `pdf`, keywords `["watermark","page number","워터마크","페이지번호","쪽번호","도장"]`). pdf 패밀리 근처 배치.
- [ ] `ko.json` / `en.json`: `tools["pdf-watermark"]` 블록 — title/description + `page.*`(업로드/모드토글/번호컨트롤/워터마크컨트롤/결과/에러 라벨 전부). ko 먼저, en 키 1:1 미러(Dictionary 타입이 ko.json에서 파생).
- [ ] tsc → no error · commit `feat(pdf-watermark): registry entry + ko/en dictionaries`

---

## Task 7: Labels adapter + UI components

- [ ] `labels.ts` (getXLabels(dict) 패턴) · `PdfWatermarkModeToggle.tsx`(ModeSelector 미러) · `PageNumberControls.tsx` · `WatermarkControls.tsx` · `PdfWatermarkPreview.tsx`(pdfjs 1페이지 + 절대배치 오버레이 캔버스; 박스는 `absolute inset-0 object-contain`로 52vh 안에서 안 잘리게 — ppt-compress 교훈) · `PdfWatermarkResult.tsx`.
- [ ] tsc → no error · commit `feat(pdf-watermark): labels + control/preview/result components`

---

## Task 8: Main component + route + workspace wiring

- [ ] `PdfWatermark.tsx`: `useToolProcessor<ApplyResult>`, analyze useEffect(파일당 1회), 모드 상태, 컨트롤 상태, 52vh 2열(좌 미리보기 / 우 적용버튼+컨트롤 or 결과 or 상태). `inline` prop. `errorOptions`(memory/corrupt 힌트).
- [ ] `page.tsx`: 형제 라우트 미러(metadata + getDictionary + 컴포넌트).
- [ ] **`Screen3Workspace.tsx`: import + `case "pdf-watermark": return <PdfWatermark inline labels={getPdfWatermarkLabels(dict)} lang={locale} />;`** (필수 — 안 하면 인라인 안 됨).
- [ ] tsc → no error · commit `feat(pdf-watermark): main component, route, workspace wiring`

---

## Task 9: Verify + visual /qa

- [ ] `pnpm tsc --noEmit` · `pnpm build` · `pnpm vitest run` 전부 그린.
- [ ] **사용자 시각 /qa (에이전트 browse 차단):** `tests/fixtures/`의 실제 악보 PDF로 —
  - 페이지번호가 각 페이지 올바른 위치(9분할)에 찍히는지, 포맷/시작번호/범위 정상.
  - **한글 텍스트 워터마크("기밀"·"사본")가 안 깨지고** 투명도·대각선 회전·타일반복 정상.
  - 로고 이미지 워터마크 정상.
  - 출력 PDF가 정상적으로 열림(페이지 수 불변).
  - 50MB 초과(찬양맞추기 170MB)는 거부 토스트.
  - 미리보기 ↔ 실제 출력 위치 일치.

---

## What already exists (재사용 — 재구축 안 함)

| 필요 | 기존 자산 | 재사용 여부 |
|---|---|---|
| 처리 상태머신/제너레이션 가드 | `useToolProcessor` | 그대로 |
| 업로드(50MB 한도) | `FileUpload` `maxSize` prop | 그대로 |
| 진행/에러 표시 | `ProcessingStatus`, `getErrorMessage`(`CORRUPT_OUTPUT:`) | 그대로 |
| 페이지 범위 파싱 | `lib/common/pageRange.ts` `parseRange` (테스트 보유) | 그대로 |
| pdfjs self-host 로드 | `lib/pdf/pdfjs.ts` `getPdfjsLib` | 그대로 |
| 다운로드/포맷/템플릿 | `downloadBlob`, `formatBytes`, `template` | 그대로 |
| PDF 쓰기 | `pdf-lib` (설치됨) | 그대로 |
| 모드 토글 UI | `ppt-background/ModeSelector` 패턴 | 미러 |
| 한글 렌더 | 앱 로드 Pretendard + Canvas 2D | 활용(폰트 임베드 안 함) |

## NOT in scope (의도적 보류)

- **이미지/로고 외 PDF→PDF 외 출력** — 이 도구는 PDF in/out만.
- **페이지 네비게이션 미리보기** — 1페이지 정적 미리보기만(좌표는 페이지 크기 동일 가정; 가변 크기 페이지는 1페이지 기준 표시). 멀티페이지 미리보기는 후속.
- **50MB 초과 파일 / 대용량 OOM 방지** — 전역 한도·OOM 폴리싱 트랙으로 분리(170MB 악보는 거부).
- **벡터/선택가능 텍스트** — D2에서 캔버스 래스터 선택. 검색 가능 텍스트가 필요해지면 후속에서 `@pdf-lib/fontkit` 재검토(하드 스톱 의존성).
- **가변 페이지 크기별 개별 앵커 미세조정** — 페이지마다 크기가 다르면 각 페이지 자체 크기로 `computeAnchor` 호출(이건 scope 내). 단 미리보기는 1페이지 기준.
- **회전된 페이지(/Rotate) 보정** — 1차 릴리스는 비회전 페이지 가정. 회전 페이지 좌표 보정은 /qa에서 문제 확인 시 후속.

## Failure modes (각 신규 코드패스)

| 코드패스 | 실패 시나리오 | 테스트 | 에러 처리 | 사용자 체감 |
|---|---|---|---|---|
| `analyzePdfForOverlay` (pdfjs) | 손상/암호화 PDF로 getDocument 실패 | — | try/catch → 미리보기 placeholder | 미리보기 없음, 적용은 시도 |
| `applyOverlay` `PDFDocument.load` | 암호화/손상 → throw | — | useToolProcessor catch → friendly | 에러 카드 + 재시도 |
| `renderTextToPng` | 폰트 미로드 시 한글 깨짐 | — | `await document.fonts.ready` | (가드됨) |
| `applyOverlay` 무결성 | 페이지 수 변동/빈 출력 | — | `CORRUPT_OUTPUT:` throw → 친절 힌트 | "결과 손상" 안내 |
| logo embed | PNG/JPG 외 포맷 업로드 | — | sniff 실패 → invalid 토스트 | 형식 안내 |
| range parse | 잘못된 범위 토큰 | `pageRange.test.ts`(기존) | lenient drop, 빈→전체 | 무시/전체 적용 |

**Critical gap 점검:** 무결성 가드 없는 silent 손상 경로 → `applyOverlay` 재오픈 가드로 차단. 폰트 미로드 한글 깨짐 → `document.fonts.ready`로 차단. **남은 silent 위험 없음.**

## Test coverage diagram

```
PURE (node vitest, 목표 100% branch)
[+] pageNumberFormat.ts
  └── formatPageNumber()  [★★★] plain/fraction/dash/ko + start offset
[+] overlayLayout.ts
  ├── computeAnchor()      [★★★] 9 positions + margin/box math
  ├── computeTilePositions()[★★★] grid cover + oversize-tile guard
  └── clampOpacity/degToRad [★★★] bounds + conversion
[+] watermarkNaming.ts
  └── deriveOutputName()    [★★★] suffix/ext-case/empty

BROWSER (tsc/build + 사용자 시각 /qa — jsdom 불가)
[+] renderTextToPng.ts      [→/qa] 한글 렌더 정확성
[+] applyPdfOverlay.ts       [→/qa] 좌표/회전/타일/투명도, 무결성

UI (사용자 시각 /qa)
[+] Preview/Controls/Result/Main  [→/qa] 미리보기=출력 일치, 모드 전환

COVERAGE: 순수 로직 100% branch | 브라우저·UI = 시각 /qa (에이전트 browse 차단)
```

## Worktree parallelization

Sequential — 모든 작업이 `src/lib/pdf/` + `pdf-watermark/` 단일 모듈에 집중. 병렬화 기회 없음.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 2 decisions locked (scope=full, korean=canvas-raster), 0 critical gaps |

- **UNRESOLVED:** 0 — 두 핵심 포크(D1 스코프, D2 한글 폰트) 모두 사용자 확정.
- **VERDICT:** ENG CLEARED — ready to implement. 순수 로직 TDD + 브라우저/UI 시각 /qa, 무결성 가드로 silent 손상 0, 신규 의존성 0.
